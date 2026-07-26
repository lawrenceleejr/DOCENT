import { useQuery } from '@tanstack/react-query';
import { api } from './client';

// Autocomplete suggestion lists for the registration + profile forms (#22).
// Public endpoints, cached a few minutes — they change rarely.
export function usePositionOptions(): string[] {
  const { data } = useQuery({
    queryKey: ['meta', 'positions'],
    queryFn: () => api.get<string[]>('/api/meta/positions'),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? [];
}

export function useInstitutionOptions(): string[] {
  const { data } = useQuery({
    queryKey: ['meta', 'institutions'],
    queryFn: () => api.get<string[]>('/api/meta/institutions'),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? [];
}
