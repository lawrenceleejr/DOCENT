# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""Admin-published policy documents (privacy policy, terms of use).

Markdown an admin writes or uploads, served to that instance's users at
/privacy and /terms. Stored as ordinary settings rows, so adding these needs no
migration.

Each document ships an *example* — a starting point an admin loads into the
editor deliberately, never the live default. An unreviewed template published
as if it were a real policy would be worse than publishing nothing: it would
make commitments about retention and jurisdiction the institution has not
checked. So empty means "not published", the page 404s, and no link appears.

The examples describe what DOCENT actually does (see PRIVACY.md, kept in step
with them) and mark everything institution-specific as [SQUARE BRACKETS] so the
gaps are obvious on sight.
"""
from dataclasses import dataclass

# Markdown is rendered client-side by react-markdown with raw HTML disabled, so
# an admin cannot inject script through these. Keep it that way: do not add
# rehype-raw to the renderer.
MAX_POLICY_CHARS = 200_000


EXAMPLE_PRIVACY = """\
# Privacy Policy

_Last updated: [DATE]_

This policy explains what [YOUR INSTITUTION] collects when you use this DOCENT
instance, why, and what you can ask us to do about it.

**Before publishing:** review every section below and replace everything in
[SQUARE BRACKETS]. The factual descriptions of what the software does are
accurate for DOCENT as shipped, but the commitments — who to contact, how long
records are kept, which law applies — are yours to make.

## Who is responsible

[YOUR INSTITUTION / DEPARTMENT] operates this instance and is the data
controller for it. Contact [PRIVACY CONTACT EMAIL] with any question about this
policy or to exercise the rights described below.

## What we collect

**Your account.** Your name and email address, which are required, and
optionally your affiliation, position, ORCID, the languages you present in, and
schools you attended. Your password is stored only as a cryptographic hash.

**The outreach events you log.** Dates, titles, event types, audience levels,
languages, people reached, durations, venues, tags and links, and who logged
each event.

**Your private notes.** Descriptions, reflections and ratings you record are
visible to you and to admins of this instance. They are excluded from every
report export and from the public impact page.

**Host contact details.** When you record a contact at a venue — a teacher,
librarian or museum staff member — their name, email, phone and any notes are
stored. Please record only what is needed to run the event, and tell the person
their details are being kept if that is not obvious to them.

**Sign-in history.** Successful logins and registrations are recorded as user,
timestamp and event type. We do not record IP addresses or browser
user-agent strings.

## What we do not collect

No advertising or profiling data, no third-party tracking, and no email is sent
by this application at all — it has no notification or password-reset mail.

## Cookies

One cookie, set when you sign in, which keeps you signed in. It is strictly
necessary for the service to work and is not used for analytics or tracking.
[IF YOU HAVE ENABLED CLOUDFLARE WEB ANALYTICS, SAY SO HERE — it is cookieless
and collects no personal profile.]

## Information that leaves this server

**Map tiles.** When you open the Map page, your browser loads map imagery
directly from [TILE PROVIDER — by default OpenStreetMap], which means your IP
address is visible to that provider. This is the only third-party request your
browser makes as part of using this instance.

**Address search.** When you search for a venue address, the request goes to
this server, which asks the geocoding provider on your behalf — your IP address
is not shared with them.

[**Sharing with sibling instances.** DELETE THIS SECTION IF FEDERATION IS OFF.
This instance publishes a feed of completed events to partner instances,
including presenter names and ORCIDs. It never includes private notes, ratings,
or host contact details.]

[**Public impact page.** DELETE THIS SECTION IF THE PUBLIC PAGE IS OFF. This
instance publishes aggregate totals and a list of recent activities at /impact,
which anyone with the link can read. It never shows who logged an event, and
never shows private notes or host contacts.]

## How long we keep it

[STATE YOUR RETENTION PERIOD. DOCENT does not delete anything automatically, so
whatever you promise here you will need to carry out yourself. Note also that
records removed from the live database remain in encrypted backups until those
backups rotate out — state that rotation period.]

## Your rights

You can ask us to give you a copy of your data, correct it, or delete it, by
contacting [PRIVACY CONTACT EMAIL]. [ADD THE SPECIFIC RIGHTS THAT APPLY IN YOUR
JURISDICTION — for example the GDPR rights of access, rectification, erasure,
restriction, portability and objection, and the right to complain to a
supervisory authority.]

If you are a venue host and someone has recorded your contact details here, you
have the same rights — write to the address above.

## Changes

We will update the date at the top when this policy changes.
"""


EXAMPLE_TERMS = """\
# Terms of Use

_Last updated: [DATE]_

These terms cover use of this DOCENT instance, operated by [YOUR INSTITUTION].

**Before publishing:** review every section and replace everything in [SQUARE
BRACKETS]. [YOUR LEGAL OR COMPLIANCE OFFICE SHOULD APPROVE THIS BEFORE IT GOES
LIVE.]

## Accounts

Accounts are issued by invitation: registration requires an access code from an
administrator, and an administrator may create an account on your behalf. You
are responsible for keeping your password secure and for activity under your
account. Tell [SUPPORT CONTACT] promptly if you believe your account has been
used by someone else.

## Acceptable use

This instance is for recording and reporting [YOUR INSTITUTION]'s outreach and
public engagement work. Please:

- Record events accurately. Reports drawn from this data are used for [GRANT
  REPORTING / ANNUAL REVIEW / WHATEVER APPLIES], so inaccurate entries have
  consequences beyond your own records.
- Only log events you took part in, or that you have been asked to record on a
  colleague's behalf.
- Do not attempt to access accounts, data or systems you have not been given
  access to.

## Recording other people's information

When you record a host contact, you are storing another person's personal
information on this system. Record only what is needed to run and follow up the
event, keep notes professional and factual, and be prepared for the person to
ask what is held about them. See our [Privacy Policy](/privacy).

## Content you enter

You keep whatever rights you have in the notes and records you enter. You give
[YOUR INSTITUTION] permission to store them and to use them in internal and
published reporting, subject to the Privacy Policy — which excludes your private
notes, reflections and ratings from every report and from the public page.

## Availability

[STATE WHAT PEOPLE CAN EXPECT: who runs the service, whether there is any
support commitment, and that it may be unavailable for maintenance. This is a
self-hosted deployment, not a commercial service with an SLA, unless you are
providing one.]

## The software

DOCENT is free software licensed under the GNU General Public License v3.0 or
later, and comes with no warranty. These terms cover *this instance*, operated
by [YOUR INSTITUTION] — not the software project.

## Ending access

[STATE WHEN ACCESS ENDS — for example when someone leaves the institution — and
what happens to the events they logged.] Administrators can deactivate an
account at any time for breach of these terms.

## Changes

We will update the date at the top when these terms change. [SAY HOW YOU WILL
NOTIFY PEOPLE OF MATERIAL CHANGES.]

## Contact

[SUPPORT CONTACT EMAIL]
"""


@dataclass(frozen=True)
class PolicyDoc:
    """One publishable document."""

    slug: str
    setting_key: str
    example: str


POLICIES: tuple[PolicyDoc, ...] = (
    PolicyDoc("privacy", "policy_privacy", EXAMPLE_PRIVACY),
    PolicyDoc("terms", "policy_terms", EXAMPLE_TERMS),
)

POLICIES_BY_SLUG = {p.slug: p for p in POLICIES}


def get_policy(slug: str) -> PolicyDoc | None:
    return POLICIES_BY_SLUG.get(slug)
