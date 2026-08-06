import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { AuthConfig } from '../api/types';

/**
 * Sets the browser tab / history title for a page. Every page previously read
 * just "DOCENT", which makes multiple tabs (Reports next to Analysis, say)
 * indistinguishable and history entries useless.
 */
export function usePageTitle(title: string) {
  const { data: config } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/api/auth/config'),
    staleTime: 5 * 60 * 1000,
  });
  const site = config?.site_name || 'DOCENT';
  useEffect(() => {
    document.title = title ? `${title} · ${site}` : site;
  }, [title, site]);
}
