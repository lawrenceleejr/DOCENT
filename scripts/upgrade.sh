#!/usr/bin/env bash
# Upgrade DOCENT to the newest release — from any earlier version, in one step.
#
#   ./scripts/upgrade.sh              upgrade to the newest release
#   ./scripts/upgrade.sh --check      show what an upgrade would do; change nothing
#   ./scripts/upgrade.sh --to v0.2.0  go to a specific version
#   ./scripts/upgrade.sh --edge       follow the development branch instead of releases
#   ./scripts/upgrade.sh --rollback   undo the last upgrade (code and data)
#   add --yes to skip the confirmation question
#
# It fetches the new code, shows the upgrade notes for every release you are
# skipping, saves a copy of the database, and starts the new version (which
# migrates the database, however many releases it is behind). If the new
# version doesn't come up healthy, your data is still in the saved copy and
# --rollback puts everything back.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. scripts/lib.sh

mode=upgrade target="" assume_yes=0
while [ $# -gt 0 ]; do
    case "$1" in
        --check) mode=check ;;
        --rollback) mode=rollback ;;
        --edge) target=@edge ;;
        --to)
            [ $# -ge 2 ] || die "--to needs a version, e.g. --to v0.2.0"
            target=$2
            shift
            ;;
        -y|--yes) assume_yes=1 ;;
        -h|--help)
            sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) die "Unknown option: $1 (try --help)" ;;
    esac
    shift
done

confirm() {  # question
    [ "$assume_yes" -eq 1 ] && return 0
    if [ ! -t 0 ]; then
        die "Not running interactively — add --yes to proceed without asking."
    fi
    printf '%s [y/N] ' "$1"
    read -r answer
    case "$answer" in y|Y|yes|YES) return 0 ;; *) echo "Nothing changed."; exit 0 ;; esac
}

git rev-parse --git-dir >/dev/null 2>&1 || die "This folder isn't a git checkout, so there is nothing to fetch." \
    "If you run the published images without a clone, upgrade with:" \
    "  docker compose -f docker-compose.release.yml pull" \
    "  docker compose -f docker-compose.release.yml up -d"
[ -f .env ] || die "DOCENT isn't installed here yet (no .env). Run ./scripts/start.sh first."
require_docker

# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------
if [ "$mode" = rollback ]; then
    [ -f "$UPGRADE_STATE" ] || die "There is no recorded upgrade to undo." \
        "(Pre-upgrade copies of the database, if any, are in $UPGRADE_BACKUP_DIR/.)"
    state() { sed -n "s/^$1=//p" "$UPGRADE_STATE" | tail -n 1; }
    dump=$(state dump)
    from_commit=$(state from_commit)
    from_version=$(state from_version)
    [ -f "$dump" ] || die "The saved database copy is missing: $dump"
    # Prefer what was actually running (it may have been older than the code
    # that happened to be checked out); fall back to the checkout's commit.
    back_to=$from_version
    if [ -z "$back_to" ] || ! git rev-parse --verify --quiet "${back_to}^{commit}" >/dev/null; then
        back_to=$from_commit
    fi
    [ -n "$back_to" ] || die "The last upgrade didn't record which version it came from." \
        "Check out the version you want by hand, then restore the saved copy:" \
        "  git checkout <version>" \
        "  ./scripts/upgrade.sh --rollback   (again, once you are on that version)"
    git rev-parse --verify --quiet "${back_to}^{commit}" >/dev/null || die "Can't find version '$back_to' in this checkout."

    echo "This will undo the upgrade made at $(state at):"
    echo "  • code:     back to ${from_version:-$back_to}"
    echo "  • database: replaced with the copy saved before that upgrade"
    echo "              ($dump)"
    echo "Anything entered into DOCENT since then will be lost."
    confirm "Roll back?"

    # Everything that can refuse happens before the database is touched.
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
        git status --short --untracked-files=no >&2
        die "The files above were edited on this machine, so the code can't be switched back." \
            "Set the edits aside with:  git stash   — then run the rollback again."
    fi
    echo "Saving the current database first, in case you change your mind..."
    db_is_running || docker compose up -d db >/dev/null
    undo=$(dump_database rollback) || die "Couldn't save the current database; rollback not started."
    echo "  Saved: $undo"

    echo "Stopping the app..."
    docker compose --profile tls stop caddy frontend backend backup >/dev/null 2>&1 || true
    echo "Returning the code to ${from_version:-$back_to}..."
    here=$(git rev-parse HEAD)
    git -c advice.detachedHead=false checkout --quiet "$back_to" ||
        die "Couldn't switch the code back. Nothing else was changed; start the app again with ./scripts/start.sh"
    echo "Restoring the database..."
    if ! restore_database "$dump"; then
        git -c advice.detachedHead=false checkout --quiet "$here" || true
        die "The restore failed, so the code was left on the newer version." \
            "The database from just before this rollback is in:" "  $undo"
    fi
    # Keep the record of what was undone, but out of the way of the next upgrade.
    mv "$UPGRADE_STATE" "$UPGRADE_STATE.rolled-back"
    echo "Starting ${from_version:-$back_to}..."
    # The older version's own start script, as it was written for it.
    exec ./scripts/start.sh
fi

# ---------------------------------------------------------------------------
# Work out where we are and where we are going
# ---------------------------------------------------------------------------
from_commit=$(git rev-parse HEAD)
from_version=$(installed_version)
from_version=${from_version:-$(code_version)}

echo "Checking for new versions..."
git fetch --quiet --tags origin || die "Couldn't reach the DOCENT repository to check for updates." \
    "Check this machine's internet connection and try again."

latest_release=$(git tag --list 'v[0-9]*' | sort -V | tail -n 1)
branch=$(git symbolic-ref --quiet --short HEAD || true)
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)

is_ancestor() { git merge-base --is-ancestor "$1" "$2" 2>/dev/null; }

if [ "$target" = @edge ]; then
    [ -n "$upstream" ] || die "--edge follows a branch, but this checkout isn't on one." \
        "Run: git checkout main   and try again."
    target_ref=$upstream
elif [ -n "$target" ]; then
    target_ref=$target
elif [ -n "$latest_release" ] && ! is_ancestor "$latest_release" HEAD; then
    # The normal case: there is a release newer than what's here.
    target_ref=$latest_release
elif [ -n "$upstream" ]; then
    # Already at or past the newest release: this checkout follows the
    # development branch, so keep following it.
    target_ref=$upstream
else
    target_ref=HEAD
fi
target_commit=$(git rev-parse --verify --quiet "${target_ref}^{commit}") ||
    die "There is no version called '$target_ref'." "Releases: $(git tag --list 'v[0-9]*' | sort -V | tr '\n' ' ')"
to_version=$(git describe --tags --exact-match "$target_commit" 2>/dev/null || git rev-parse --short "$target_commit")

if [ "$target_commit" = "$from_commit" ]; then
    current_rev=$(db_revision)
    if [ -z "$current_rev" ] || [ "$current_rev" = "$(code_head_revision)" ]; then
        echo "DOCENT is up to date (${to_version})."
        [ "$mode" = check ] && exit 0
        # Still worth a pass through start.sh: it rebuilds on base-image
        # updates and restarts anything that stopped.
        exec ./scripts/start.sh
    fi
fi

# ---------------------------------------------------------------------------
# Show the plan: every release in between, and what each asks of the admin
# ---------------------------------------------------------------------------
# Upgrade notes come from the changelog of the version being installed.
changelog=$(git show "${target_commit}:CHANGELOG.md" 2>/dev/null || true)
# Releases newer than the installed one, up to the target. A commit past the
# last release also gets the "Unreleased" section.
from_release=$(printf '%s\n' "$from_version" | grep -E '^v[0-9]' || git describe --tags --abbrev=0 "$from_commit" 2>/dev/null || true)
crossed=$(git tag --list 'v[0-9]*' --merged "$target_commit" | sort -V | while read -r tag; do
    if [ -z "$from_release" ] || { [ "$tag" != "$from_release" ] &&
        [ "$(printf '%s\n%s\n' "$from_release" "$tag" | sort -V | tail -n 1)" = "$tag" ]; }; then
        echo "$tag"
    fi
done)
if ! git describe --tags --exact-match "$target_commit" >/dev/null 2>&1; then
    crossed=$(printf '%s\n%s' "$crossed" Unreleased | sed '/^$/d')
fi

notes_for() {  # section heading (v1.2.3 or Unreleased) -> its "Upgrading" notes
    printf '%s\n' "$changelog" | awk -v want="## $1" '
        /^## / { in_release = ($0 == want); in_notes = 0; next }
        in_release && /^### / { in_notes = ($0 == "### Upgrading"); next }
        in_release && in_notes && NF { print }
    '
}

echo
echo "Installed:  ${from_version:-unknown}"
echo "Available:  ${to_version}"
if [ -n "$crossed" ]; then
    count=$(printf '%s\n' "$crossed" | grep -c .)
    echo
    echo "This upgrade covers ${count} release(s) in one step: $(printf '%s' "$crossed" | tr '\n' ' ')"
    any_notes=0
    for release in $crossed; do
        notes=$(notes_for "$release")
        if [ -n "$notes" ]; then
            any_notes=1
            echo
            echo "── Upgrade notes for ${release} ──"
            printf '%s\n' "$notes"
        fi
    done
    [ "$any_notes" -eq 1 ] || echo "None of them needs anything from you."
fi
echo
echo "What happens next:"
echo "  1. The database is copied to ${UPGRADE_BACKUP_DIR}/ (kept on this machine)."
echo "  2. DOCENT ${to_version} is built and started; it migrates the database itself."
echo "  3. If it doesn't come up healthy, ./scripts/upgrade.sh --rollback undoes it."
echo "The site is briefly unavailable while it restarts."

[ "$mode" = check ] && exit 0

# Uncommitted edits to tracked files would block the update (or be overwritten).
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo >&2
    git status --short --untracked-files=no >&2
    die "The files above were edited on this machine, so the code can't be updated safely." \
        "Settings belong in .env (which is never touched). To set your edits aside:" \
        "  git stash        (bring them back later with: git stash pop)" \
        "then run this script again."
fi
echo
confirm "Upgrade now?"

# ---------------------------------------------------------------------------
# Do it
# ---------------------------------------------------------------------------
if [ "$target_commit" != "$from_commit" ]; then
    if [ -n "$branch" ] && is_ancestor HEAD "$target_commit"; then
        git merge --quiet --ff-only "$target_commit"
    else
        # Going to a version that isn't straight ahead of this branch (an older
        # release, say): sit exactly on it.
        git -c advice.detachedHead=false checkout --quiet "$target_commit"
    fi
fi

# Hand over to the *new* start.sh, telling it what we came from so its
# pre-upgrade backup records the way back.
export DOCENT_UPGRADE_FROM_COMMIT=$from_commit
export DOCENT_UPGRADE_FROM_VERSION=$from_version
exec ./scripts/start.sh
