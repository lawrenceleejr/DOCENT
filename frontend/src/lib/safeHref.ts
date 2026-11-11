/** A user- or peer-supplied address is only ever linked when it is a plain web
 * URL. Anything else (javascript:, data:, a bare word that would resolve as a
 * relative path) renders as no link at all. The API enforces the same rule on
 * write; this is the second check, at the point of use. */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;
}
