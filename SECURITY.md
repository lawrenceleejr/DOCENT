# Security & safe deployment

This is the short, practical guide for a team standing up DOCENT for their
community. Follow the checklist and you have a safe default deployment.

## Deploy safely in 6 steps

1. **Run the start script.** `./scripts/start.sh` generates a strong random
   `SECRET_KEY` and `POSTGRES_PASSWORD` in `.env` on first run. Never commit
   `.env` (it is git-ignored) and never reuse the placeholder values.

2. **Put HTTPS in front.** DOCENT speaks plain HTTP inside Docker and, by
   default, publishes its port on `127.0.0.1` only — so it is reachable **only**
   through a TLS reverse proxy on the same host. Use [Caddy](https://caddyserver.com)
   (automatic certificates):

   ```caddy
   docent.example.org {
       reverse_proxy 127.0.0.1:8080
       # Don't trust client-supplied forwarding headers — set them ourselves.
       request_header -X-Forwarded-For
   }
   ```

   Never expose the app's port directly to the internet. Only set
   `BIND_HOST=0.0.0.0` on a trusted private LAN that has no proxy.

3. **Registration requires an access code.** `start.sh` generates one on first
   run (stored as `INVITE_CODE` in `.env`) and prints it; with no code set,
   sign-up is closed entirely. Set `CONTACT_EMAIL` in `.env` so the login/register
   pages tell people who to ask for a code or a password reset.

4. **Claim the admin account immediately.** The **first** account registered
   (with the access code) becomes the admin. Do that the moment the site is up,
   *before* sharing the code — then hand the code only to members you want to
   let in. Rotate it any time by changing `INVITE_CODE` and re-running `start.sh`.

5. **Keep secrets and backups safe.** Restrict who can read `.env` and the host
   (they hold DB and session secrets). Back up off-host regularly
   (`./scripts/download-backups.sh`) and store those copies encrypted.

6. **Keep it patched.** `git pull && ./scripts/start.sh` rebuilds with the latest
   base images and dependencies. Do this periodically.

## What the app already does for you

- **Passwords** hashed with Argon2 (`pwdlib`), never stored or logged in clear.
- **Sessions** are a signed JWT in an **HttpOnly**, **SameSite=Lax** cookie
  (not readable by JavaScript, not the default cross-site target of CSRF). The
  `Secure` flag is set automatically on HTTPS.
- **Refuses to boot** with a missing, placeholder, or too-short `SECRET_KEY`.
- **Rate limiting** on login (10 / 5 min per IP) and registration (5 / hour).
- **Access control**: only a visit's author or an admin can edit/delete it;
  admin-only endpoints are guarded; you can't remove your own admin/active flag.
- **Account recovery**: an admin can reset any member's password from
  *Admin → Reset password*. It shows a one-time temporary password to hand over;
  the member changes it from their profile after logging back in.
- **Injection-safe**: all database access is via the SQLAlchemy ORM with bound
  parameters; no string-built SQL.
- **Same-origin only**: no CORS is enabled; the browser only ever calls this
  origin. The API docs (`/docs`) are not exposed through the proxy.
- **Security headers** on every response: `Content-Security-Policy`,
  `X-Frame-Options: DENY` (no clickjacking), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`.
- **Outbound calls** (OpenStreetMap Overpass/Nominatim for the map importer) go
  to fixed, hard-coded hosts — users cannot point them elsewhere. That importer
  is **admin-only**.

## Know your data model (by design)

- **Community-visible:** every logged-in member can see all visits, including
  **host contact details and private reflection notes**, and can export them via
  *Visits → Export CSV*. Combined with open registration, that means anyone who
  can sign up can read that data. If your hosts' contact info is sensitive,
  **turn on `INVITE_CODE`** so only trusted members can register. (The separate
  **Reports** export is safe to share externally — it never includes notes,
  ratings, or contact details.)
- Sessions last `ACCESS_TOKEN_DAYS` (default 7). Logout clears the cookie;
  deactivating a user blocks them immediately on their next request.

## Residual items to weigh for your threat model

- **IP-based rate limiting trusts the proxy.** It reads the forwarded client IP,
  so a misconfigured proxy that passes through client-supplied `X-Forwarded-For`
  could let an attacker rotate the value to dodge the limit. The Caddy snippet
  above strips it; keep the app bound to `127.0.0.1` so nginx is never reached
  directly. Argon2's slow hashing remains a brute-force cost either way.
- **No session revocation list.** A stolen, unexpired token stays valid until it
  expires. Lower `ACCESS_TOKEN_DAYS` if that risk matters to you. Changing a
  password does not retroactively kill other sessions.
- **Backups are unencrypted** `pg_dump` files on a Docker volume. Encrypt the
  off-host copies you keep.
- **Containers run as root inside their images.** Acceptable for a single-host
  community deployment; for a hardened host, run Docker rootless and/or add
  per-service `user:` and resource limits.

## Reporting a problem

Found a security issue? Contact the repository owner privately rather than
opening a public issue.
