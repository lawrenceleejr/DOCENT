import { Select } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import type { Paginated, Venue } from '../api/types';

/** Searchable "pick any venue" filter — distinct from VenuePicker, which is a
 * controlled single-select-with-create used inside forms. */
export function VenueFilterSelect({
  value,
  onChange,
  placeholder = 'Filter by school/venue',
  w = 240,
}: {
  value: number | null;
  onChange: (venueId: number | null) => void;
  placeholder?: string;
  w?: number;
}) {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 250);
  const { data } = useQuery({
    queryKey: ['venues', 'filterselect', debounced],
    queryFn: () => api.get<Paginated<Venue>>('/api/venues', { q: debounced, page_size: 20 }),
  });
  const options = (data?.items ?? []).map((v) => ({
    value: String(v.id),
    label: v.city ? `${v.name} — ${v.city}` : v.name,
  }));
  return (
    <Select
      placeholder={placeholder}
      searchable
      clearable
      data={options}
      value={value !== null ? String(value) : null}
      searchValue={search}
      onSearchChange={setSearch}
      onChange={(v) => onChange(v ? Number(v) : null)}
      w={w}
    />
  );
}
