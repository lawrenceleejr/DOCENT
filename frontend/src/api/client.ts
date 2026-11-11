import i18n from '../i18n';

/** Where to send someone after they sign in again: the page they were on. Only
 * ever a path on this site — never an absolute URL from the query string. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}

/** A readable message for an error response that carries no JSON detail of its
 * own — typically one produced by the web server in front of the API. */
function fallbackMessage(status: number, statusText: string): string {
  if (status === 413) return i18n.t('common.tooLarge');
  if (status === 429) return i18n.t('common.tooManyRequests');
  if (status >= 502 && status <= 504) return i18n.t('common.serverUnavailable');
  return statusText || i18n.t('common.unexpectedError');
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | string[] | null | undefined>;

export function buildQuery(params?: Query): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      // Repeated params (?position=a&position=b) — FastAPI list query params.
      for (const item of value) search.append(key, item);
    } else if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; params?: Query; form?: FormData } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path + buildQuery(options.params), {
      method,
      credentials: 'include',
      // FormData sets its own multipart Content-Type (with boundary); only JSON
      // bodies get an explicit header.
      headers:
        options.body !== undefined && !options.form
          ? { 'Content-Type': 'application/json' }
          : undefined,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      });
  } catch {
    // fetch only rejects when the request never got an answer.
    throw new ApiError(0, i18n.t('common.networkError'));
  }

  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    // The session ended; come back to this page after signing in again.
    const here = window.location.pathname + window.location.search;
    window.location.href =
      here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`;
  }

  if (!response.ok) {
    let detail = fallbackMessage(response.status, response.statusText);
    try {
      const data = await response.json();
      if (typeof data.detail === 'string') detail = data.detail;
      else if (Array.isArray(data.detail)) detail = data.detail[0]?.msg ?? detail;
      // Pydantic prefixes messages raised from a validator with "Value error, ";
      // that's framework noise in front of text written for the user.
      detail = detail.replace(/^Value error,\s*/, '');
    } catch {
      // non-JSON error body; keep the fallback message
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  postForm: <T>(path: string, form: FormData) => request<T>('POST', path, { form }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
