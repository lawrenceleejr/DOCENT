// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../api/client';
import type { AuthConfig } from '../api/types';
import { doNotTrackEnabled } from './analytics';

const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
// Marks the script we own so we can find and replace it when the token changes.
const MARKER_ATTR = 'data-docent-analytics';

/**
 * Loads the Cloudflare Web Analytics beacon on every page when an admin has
 * configured a token (Admin → Analytics). Mounted once at the app root so it
 * covers the public impact, login, and register pages too — not just the
 * authenticated app.
 *
 * We build the `<script>` ourselves from the parsed token rather than injecting
 * the admin's pasted HTML, so no admin-entered markup is ever evaluated. The
 * beacon is cookieless; we additionally skip it for visitors who send
 * Do-Not-Track.
 */
export function AnalyticsBeacon() {
  const { data } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/api/auth/config'),
    staleTime: 5 * 60_000,
  });
  const token = data?.cf_analytics_token ?? null;

  useEffect(() => {
    // Always clear any beacon we previously added — covers the token being
    // cleared, and stops StrictMode's double-invoke from stacking two scripts.
    document.head.querySelector(`script[${MARKER_ATTR}]`)?.remove();

    if (!token || doNotTrackEnabled()) return;

    const script = document.createElement('script');
    script.defer = true;
    script.src = BEACON_SRC;
    // Cloudflare reads the token from this attribute; setting it as a string
    // (not innerHTML) keeps the token strictly a data value, never markup.
    script.setAttribute('data-cf-beacon', JSON.stringify({ token }));
    script.setAttribute(MARKER_ATTR, 'cf');
    document.head.appendChild(script);

    return () => script.remove();
  }, [token]);

  return null;
}
