// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.

/** Cloudflare Web Analytics beacon tokens are hex strings. Pull the token out
 * of whatever the admin pasted — the full
 * `<script … data-cf-beacon='{"token":"…"}'>` snippet, or just the bare token —
 * so we only ever inject our own canonical beacon and never the raw HTML.
 * Mirrors the server-side parser in `backend/app/services/settings.py`. */
const CF_TOKEN_RE = /token["']?\s*:\s*["']([0-9a-fA-F]{6,64})["']/;
const BARE_TOKEN_RE = /^[0-9a-fA-F]{6,64}$/;

export function extractCfToken(input: string | null | undefined): string | null {
  const snippet = (input ?? '').trim();
  if (!snippet) return null;
  const match = CF_TOKEN_RE.exec(snippet);
  if (match) return match[1];
  if (BARE_TOKEN_RE.test(snippet)) return snippet;
  return null;
}

/** True when the visitor has asked not to be tracked, via any of the flavours
 * of the (deprecated but still honoured) Do-Not-Track signal. We skip the
 * beacon for these visitors, in keeping with DOCENT's privacy posture. */
export function doNotTrackEnabled(): boolean {
  const signals = [
    navigator.doNotTrack,
    (window as unknown as { doNotTrack?: string }).doNotTrack,
    (navigator as unknown as { msDoNotTrack?: string }).msDoNotTrack,
  ];
  return signals.some((s) => s === '1' || s === 'yes');
}
