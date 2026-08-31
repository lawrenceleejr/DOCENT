# Data handling in DOCENT

This document describes what the DOCENT software stores, what it sends outside
your server, and what it deliberately withholds. It is written for the person
**deploying** an instance, so that your institution can write its own privacy
notice without reading the source.

It is not itself a privacy policy. Each institution running DOCENT is the data
controller for its own instance; this project operates no service and receives
no data from your deployment. DOCENT ships an admin panel where you can publish
your own privacy policy and terms of use to your users (**Admin → Policy
documents**), with an example to start from.

Nothing here is legal advice. Your institution's privacy or compliance office
is the authority on what your deployment requires.

---

## What is stored

### Accounts

Registration requires an access code from an admin — there is no open sign-up.
An account holds:

| Field | Notes |
| --- | --- |
| Name, email | Required. Email is the login identifier. |
| Password | Stored only as an Argon2 hash, never in plain text. |
| Affiliation, position | Optional, free text. |
| ORCID | Optional. |
| Languages spoken, schools attended | Optional; powers the member directory. |
| Admin flag, active flag | Access control. |

An admin can also create an account for a colleague without them signing up. No
password is chosen in that case: a long random one is hashed and discarded, so
no login attempt against it can succeed until an admin issues a reset.

### Activity records

Each logged event stores the date, title, event type, audience level(s),
language, people reached (in person and remote/broadcast), duration, status,
venue, tags and links, plus who logged it and any co-presenters.

### Host contact details — the most sensitive data in the system

A venue record can hold a **host contact name, email address, phone number and
free-text notes**. This is personal data about someone who is usually *not* a
user of your instance and never interacted with it — a teacher, librarian or
museum staff member whose details a communicator recorded.

Treat it accordingly:

- Under the GDPR this is personal data obtained other than from the data
  subject, which carries its own transparency duty (Art. 14).
- It is excluded from every report export and from the public impact page (see
  below), but it is stored in the database, appears in the venue detail view to
  signed-in users, and is included in database backups and admin exports.
- If your instance may hold details of people in a jurisdiction with such
  rights, decide in advance how you will answer an access or erasure request.

### Login history

Successful logins and registrations are recorded for the admin login-history
view, as **user, timestamp and event type only**. No IP address and no
user-agent string are recorded — deliberately, so the log stays an activity
record rather than a tracking record.

### Reflections, ratings and descriptions

A communicator's own private notes on an event. Never leave the instance: they
are excluded from every report format and from the public page.

---

## What leaves your server

### Map tiles — the one call made by the user's browser

The Map page loads basemap tiles directly from a tile server, so **each viewer's
browser contacts that provider and their IP address is visible to it**. By
default that provider is OpenStreetMap (`tile.openstreetmap.org`). An admin can
point it at a different provider — CARTO with their own key, Stadia, MapTiler,
or a tile server you host yourself — under **Admin → Basemap tiles**. Pointing
it at a self-hosted tile server removes this flow entirely.

This is the only third-party request made from the user's browser by default.

### Address search and institution import — made by the server, not the browser

Address autocomplete is proxied through your own backend: the browser calls your
instance, and your instance calls the geocoder. The user's IP address is
therefore **not** exposed to the geocoding provider — only your server's is. The
same applies to the OpenStreetMap institution import.

The providers are configurable (`PHOTON_URL`, `NOMINATIM_URL`, `OVERPASS_URL`);
by default they are Photon (Komoot), Nominatim and Overpass. The data sent is
the address text being searched, or the region being imported.

### Federation — off unless you turn it on

If you enable federation publishing, your instance serves a token-authenticated
activities feed to sibling instances. **This includes presenter names and
ORCIDs**, so it is a transfer of personal data to another organisation. It is
off by default, requires the token in the URL, and can be limited to completed
events (excluding planned ones). Private fields are never included.

### Website analytics — off unless you turn it on

Optional Cloudflare Web Analytics. Cookieless, collects no personal profiles,
and DOCENT builds the beacon from your token rather than executing pasted HTML.
Off unless an admin configures it.

### Nothing else

No telemetry is sent to this project or anywhere else. There are no email
features at all — no notifications, no self-service password reset — so no
address is ever handed to a mail provider by the application.

---

## What is deliberately withheld

Two surfaces are constrained by design, and the test suite enforces it:

**Report exports** (JSON, CSV, Markdown, LaTeX, PDF) never include private
descriptions, reflections, ratings, or host contact details and notes.

**The public impact page** (`/impact`, off unless an admin enables it) shows
aggregate totals, time series and breakdowns plus a short list of recent
activities with factual fields only — and additionally never shows communicator
identities.

---

## Cookies

One cookie: the session cookie set at login. It is strictly necessary for the
service to function, carries no tracking or profiling, and is not used for
analytics. Optional Cloudflare Web Analytics is cookieless.

On that basis a consent banner is generally not required. Confirm against your
own jurisdiction and institutional policy.

---

## Retention, access and deletion

DOCENT does not expire or auto-delete anything; records persist until someone
removes them. There is no built-in retention schedule, so if your policy
promises one, you must operate it.

The tools available to an admin:

- **Deactivate or delete a user** from the admin panel.
- **Delete a venue**, which removes its attached events after a confirmation.
- **Export the whole database** as JSON from the admin panel, or a filtered
  activity export in JSON/CSV/Markdown/LaTeX/PDF from Reports, to satisfy an
  access request.
- **Backups**: the backup sidecar writes nightly rotated `pg_dump`s to
  `BACKUP_DIR`. Deleting a record from the live database does *not* remove it
  from existing backups — factor your backup rotation into any erasure promise.

---

## Where your data lives

On your server, in your PostgreSQL database, inside your infrastructure. This
project has no copy of it and no access to it. The third-party calls listed
above are the complete set of exceptions, and every one of them is either
configurable or optional.
