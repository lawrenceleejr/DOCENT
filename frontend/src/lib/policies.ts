/**
 * The policy documents an instance can publish.
 *
 * Only the slugs live here. The example markdown is served by the backend
 * (`GET /api/admin/policies/examples`) rather than duplicated in the bundle —
 * these are long documents kept in step with PRIVACY.md, and two copies would
 * drift.
 */
export const POLICY_SLUGS = ['privacy', 'terms'] as const;

export type PolicySlug = (typeof POLICY_SLUGS)[number];

/** Markdown examples keyed by slug, as returned by the admin endpoint. */
export type PolicyExamples = Record<PolicySlug, string>;
