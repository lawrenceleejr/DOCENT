import { MultiSelect } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { ContributorUser } from '../api/types';

/**
 * Search-as-you-type picker for co-presenters who have an account here. The
 * selected user ids are stored on the visit and their ORCIDs travel with
 * federation (#9). Free-text-only names still go in the separate field.
 */
export function CoPresenterPicker({
  value,
  onChange,
  initialUsers,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  initialUsers?: ContributorUser[];
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  // id -> display name, so already-selected people keep their label even when
  // they're not in the current search results.
  const [labels, setLabels] = useState<Record<number, string>>(() =>
    Object.fromEntries((initialUsers ?? []).map((u) => [u.id, u.name])),
  );

  const { data: results = [] } = useQuery({
    queryKey: ['users', 'search', search],
    queryFn: () => api.get<ContributorUser[]>('/api/users/search', { q: search }),
    enabled: search.trim().length >= 1,
  });

  useEffect(() => {
    if (results.length === 0) return;
    setLabels((prev) => {
      const next = { ...prev };
      for (const u of results) next[u.id] = u.name;
      return next;
    });
  }, [results]);

  const options = useMemo(() => {
    const ids = new Set<number>([...value, ...results.map((u) => u.id)]);
    return [...ids].map((id) => ({ value: String(id), label: labels[id] ?? `#${id}` }));
  }, [value, results, labels]);

  return (
    <MultiSelect
      label={t('visitForm.coPresentersLabel')}
      description={t('visitForm.coPresentersDescription')}
      placeholder={value.length ? undefined : t('visitForm.coPresentersPlaceholder')}
      searchable
      clearable
      data={options}
      value={value.map(String)}
      searchValue={search}
      onSearchChange={setSearch}
      onChange={(vals) => onChange(vals.map(Number))}
      // Results are already filtered server-side; don't re-filter locally.
      filter={({ options }) => options}
      nothingFoundMessage={
        search.trim() ? t('visitForm.coPresentersNothing') : undefined
      }
    />
  );
}
