# Security & safe deployment

This is the short, practical guide for a team standing up DOCENT for their
community. Follow the checklist and you have a safe default deployment.

## Deploy safely in 6 steps

1. **Run the start script.** `./scripts/start.sh` generates a strong random
   `SECRET_KEY` and `POSTGRES_PASSWORD` in `.env` on first run, readable only by
   you. Never commit `.env` (it is git-ignored) and never reuse the placeholder
   values — the backend refuses to start with them.

2. **Put HTTPS in front.** DOCENT speaks plain HTTP inside Docker and, by
   default, publishes its port on `127.0.0.1` only. The simplest route is the
   bundled proxy: set `SITE_DOMAIN` in `.env` and re-run `start.sh`, and a
   [Caddy](https://caddyserver.com) container obtains and renews the
   certificate. To use your own proxy instead, point it at `127.0.0.1:8080`
   (see the README). Either way, never expose port 8080 directly to the
   internet; only set `BIND_HOST=0.0.0.0` on a trusted private network.

3. **Registration requires an access code.** `start.sh` generates one on first
   run (stored as `INVITE_CODE` in `.env`) and shows it until the first account
   exists; with no code set, sign-up is closed entirely. There is no open
   sign-up mode. Set a contact email (Admin → Registration, or `CONTACT_EMAIL`)
   so the login page tells people who to ask for a code or a password reset.

4. **Claim the admin account immediately.** The **first** account registered
   (with the access code) becomes the admin. Do that the moment the site is up,
   *before* sharing the code. Rotate the code any time under Admin →
   Registration.

5. **Keep secrets and backups safe.** Restrict who can log in to the host:
   `.env` holds the database and session secrets, and each backup is the whole
   database. Copy backups off the machine regularly
   (`./scripts/download-backups.sh`) and store those copies encrypted.

6. **Keep it patched.** `./scripts/upgrade.sh` moves you to the newest release
   in one step, however many you have skipped: it shows each skipped release's
   upgrade notes, saves the database first, and `--rollback` undoes it. Do
   this periodically.

## What the app already does for you

- **Passwords** hashed with Argon2 (`pwdlib`), never stored or logged in clear.
- **Sessions** are a signed JWT in an **HttpOnly**, **SameSite=Lax** cookie
  (not readable by JavaScript). The `Secure` flag is set automatically on HTTPS.
  Changing a password, or an admin resetting it, ends every earlier session and
  invalidates that person's calendar feed link.
- **Cross-site requests are refused.** Any request that changes data is
  rejected when the browser reports it came from another site — including a
  sibling subdomain, which `SameSite` alone would let through.
- **Refuses to boot** with a missing, placeholder, or too-short `SECRET_KEY`,
  or the placeholder database password.
- **Rate limiting** on login (10 per 5 minutes per client address, and 10
  failed attempts per 15 minutes per account, whatever address they come from)
  and on registration (5 per hour per address). The client address is resolved
  by the bundled nginx, which believes `X-Forwarded-For` only from a proxy on a
  private address and never from the client itself.
- **Access control**: only an event's author or an admin can edit or delete it;
  a venue holding other people's events can only be deleted by an admin;
  admin-only endpoints are guarded; you can't remove your own admin or active
  flag.
- **Account recovery**: an admin can reset any member's password from
  *Admin → Reset password*. It shows a one-time temporary password to hand over;
  the member changes it from their profile after logging back in. There is no
  email-based reset, by design.
- **Injection-safe**: database access is through the SQLAlchemy ORM with bound
  parameters. CSV exports neutralize cells that a spreadsheet would run as a
  formula. Web addresses entered by members or received from sibling instances
  are only stored and linked when they are `http(s)`.
- **Same-origin only**: no CORS is enabled; the browser only ever calls this
  origin. The API docs (`/docs`) are not exposed through the proxy.
- **Security headers** on every response: a `Content-Security-Policy` that
  allows no inline or third-party script (the one exception is the optional
  Cloudflare analytics beacon), `Strict-Transport-Security` over HTTPS,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`
  and `Permissions-Policy`.
- **Unprivileged containers.** The API and the backup job run as a non-root
  user, containers cannot gain privileges, and their logs are size-capped.
- **Private backups.** Dumps are written readable only by the service user
  (`0600` in a `0700` folder), not by every account on the host. Use
  `./scripts/download-backups.sh` (or `sudo`) to copy them.

## Know your data model (by design)

- **Community-visible:** every signed-in member can see all events, including
  **host contact details, descriptions, reflections and ratings**, and can
  export them via *Events → Export CSV*. DOCENT is a shared record for a group
  that trusts each other; the access code is what keeps everyone else out, so
  share it only with people you would show that data to.
- **Never leaves the community:** the **Reports** exports and the public
  `/impact` page never include descriptions, reflections, ratings, or host
  email, phone or notes. Reports do list each event's host name and role; the
  public page shows no host or communicator identities at all.
- Sessions last `ACCESS_TOKEN_DAYS` (default 7). Logout clears the cookie;
  deactivating a user blocks them immediately on their next request.
- [`PRIVACY.md`](PRIVACY.md) lists what is stored and every outbound call.

## Residual items to weigh for your threat model

- **Admins are fully trusted.** An admin can read everything, restore the
  database from an uploaded dump (which amounts to running SQL as the database
  owner), and point the server at URLs of their choosing: a sibling's
  federation feed and the basemap tile server are fetched by the backend, so a
  malicious admin could use them to probe the server's own network. Give the
  role only to people you would give a shell on the machine.
- **A logged-out token is not revoked server-side.** Logging out clears the
  cookie, but a token copied beforehand stays valid until it expires or the
  password changes. Lower `ACCESS_TOKEN_DAYS` if that matters to you.
- **Account lockout is a trade-off.** Ten wrong passwords pause sign-in for
  that account for up to 15 minutes, which also lets someone who knows a
  member's email delay their login. It never blocks an existing session.
- **Rate limits are per process and in memory.** They reset when the backend
  restarts, and a direct request from the host itself (bypassing your proxy) is
  taken at its word about the client address. Keep port 8080 bound to
  `127.0.0.1`.
- **Federation tokens travel in the feed URL**, so they can appear in proxy
  access logs on both sides. Treat a feed URL as a password and rotate it
  (Admin → Federation) if it leaks.
- **Backups are unencrypted** `pg_dump` files. Encrypt the off-host copies you
  keep.

## Reporting a problem

Found a security issue? Please report it privately rather than opening a public
issue: use GitHub's
[private vulnerability reporting](https://github.com/lawrenceleejr/DOCENT/security/advisories/new)
for this repository, or contact the repository owner directly. Include the
version shown in the app footer and steps to reproduce.
