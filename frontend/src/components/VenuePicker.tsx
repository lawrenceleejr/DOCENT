import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { labelize, VENUE_TYPES, type Paginated, type Venue } from '../api/types';

const CREATE_OPTION = '__create__';

interface VenuePickerProps {
  value: number | null;
  onChange: (venueId: number | null) => void;
  error?: string;
}

export function VenuePicker({ value, onChange, error }: VenuePickerProps) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['venues', 'picker', search],
    queryFn: () => api.get<Paginated<Venue>>('/api/venues', { q: search, page_size: 20 }),
  });

  // Keep the currently selected venue resolvable even when it doesn't match the search.
  const { data: selected } = useQuery({
    queryKey: ['venues', value],
    queryFn: () => api.get<Venue>(`/api/venues/${value}`),
    enabled: value !== null,
  });

  const options = useMemo(() => {
    const venues = data?.items ?? [];
    const byId = new Map(venues.map((v) => [v.id, v]));
    if (selected && !byId.has(selected.id)) byId.set(selected.id, selected);
    const opts = [...byId.values()].map((v) => ({
      value: String(v.id),
      label: `${v.name}${v.city ? ` — ${v.city}` : ''} (${labelize(v.venue_type)})`,
    }));
    return [...opts, { value: CREATE_OPTION, label: '+ Create new venue…' }];
  }, [data, selected]);

  return (
    <>
      <Select
        label="Venue"
        placeholder="Search schools, colleges, museums…"
        searchable
        clearable
        data={options}
        value={value !== null ? String(value) : null}
        searchValue={search}
        onSearchChange={setSearch}
        error={error}
        nothingFoundMessage="No venues match — create one"
        onChange={(picked) => {
          if (picked === CREATE_OPTION) {
            setCreating(true);
          } else {
            onChange(picked ? Number(picked) : null);
          }
        }}
      />
      <VenueFormModal
        opened={creating}
        onClose={() => setCreating(false)}
        initialName={search}
        onSaved={(venue) => {
          queryClient.invalidateQueries({ queryKey: ['venues'] });
          onChange(venue.id);
          setCreating(false);
        }}
      />
    </>
  );
}

interface VenueFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSaved: (venue: Venue) => void;
  /** When provided, the modal edits this venue instead of creating a new one. */
  venue?: Venue;
  initialName?: string;
}

export function VenueFormModal({
  opened,
  onClose,
  onSaved,
  venue,
  initialName = '',
}: VenueFormModalProps) {
  const editing = venue !== undefined;
  const form = useForm({
    initialValues: {
      name: venue?.name ?? initialName,
      venue_type: venue?.venue_type ?? 'elementary_school',
      address: venue?.address ?? '',
      city: venue?.city ?? '',
      state: venue?.state ?? '',
      country: venue?.country ?? 'USA',
      latitude: (venue?.latitude ?? '') as number | '',
      longitude: (venue?.longitude ?? '') as number | '',
      notes: venue?.notes ?? '',
    },
    validate: {
      name: (v) => (v.trim().length > 0 ? null : 'Name is required'),
      venue_type: (v) => (v ? null : 'Type is required'),
    },
  });

  const save = useMutation({
    mutationFn: (values: typeof form.values) => {
      const payload = {
        name: values.name.trim(),
        venue_type: values.venue_type,
        address: values.address.trim() || null,
        city: values.city.trim() || null,
        state: values.state.trim() || null,
        country: values.country.trim() || 'USA',
        latitude: values.latitude === '' ? null : values.latitude,
        longitude: values.longitude === '' ? null : values.longitude,
        notes: values.notes.trim() || null,
      };
      return editing
        ? api.patch<Venue>(`/api/venues/${venue.id}`, payload)
        : api.post<Venue>('/api/venues', payload);
    },
    onSuccess: (saved) => {
      if (!editing) form.reset();
      onSaved(saved);
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: editing ? 'Could not save venue' : 'Could not create venue',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Edit venue' : 'New venue'} size="lg">
      <form onSubmit={form.onSubmit((values) => save.mutate(values))}>
        <Stack>
          <Group grow>
            <TextInput label="Name" placeholder="Lincoln Elementary" {...form.getInputProps('name')} />
            <Select
              label="Type"
              data={VENUE_TYPES.map((t) => ({ value: t, label: labelize(t) }))}
              {...form.getInputProps('venue_type')}
            />
          </Group>
          <TextInput label="Street address" {...form.getInputProps('address')} />
          <Group grow>
            <TextInput label="City" {...form.getInputProps('city')} />
            <TextInput label="State / region" {...form.getInputProps('state')} />
            <TextInput label="Country" {...form.getInputProps('country')} />
          </Group>
          <Group grow>
            <NumberInput
              label="Latitude"
              decimalScale={6}
              min={-90}
              max={90}
              {...form.getInputProps('latitude')}
            />
            <NumberInput
              label="Longitude"
              decimalScale={6}
              min={-180}
              max={180}
              {...form.getInputProps('longitude')}
            />
          </Group>
          <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Create venue'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
