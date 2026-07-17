import {
  Autocomplete,
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
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import {
  institutionVenueType,
  VENUE_TYPES,
  type InstitutionDetail,
  type Paginated,
  type PlaceSuggestion,
  type Venue,
} from '../api/types';
import { useEnumLabel } from '../i18n/enumLabels';

const CREATE_OPTION = '__create__';
const CATALOG_PREFIX = 'inst:';

interface VenuePickerProps {
  value: number | null;
  onChange: (venueId: number | null) => void;
  error?: string;
}

export function VenuePicker({ value, onChange, error }: VenuePickerProps) {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<VenuePrefill | undefined>();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['venues', 'picker', search],
    queryFn: () => api.get<Paginated<Venue>>('/api/venues', { q: search, page_size: 20 }),
  });

  // Also search the catalog so a visit can start from a not-yet-visited institution.
  const { data: institutions } = useQuery({
    queryKey: ['institutions', 'picker', search],
    queryFn: () => api.get<InstitutionDetail[]>('/api/institutions', { q: search, limit: 8 }),
    enabled: search.trim().length >= 2,
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
    const venueOpts = [...byId.values()].map((v) => ({
      value: String(v.id),
      label: `${v.name}${v.city ? ` — ${v.city}` : ''} (${enumLabel.venueType(v.venue_type)})`,
    }));

    // Catalog entries whose name doesn't already match an existing venue option.
    const existingNames = new Set([...byId.values()].map((v) => v.name.toLowerCase()));
    const catalogOpts = (institutions ?? [])
      .filter((i) => !existingNames.has(i.name.toLowerCase()))
      .map((i) => ({
        value: `${CATALOG_PREFIX}${i.id}`,
        label: `＋ ${i.name}${i.city ? ` — ${i.city}` : ''} (${enumLabel.institutionType(i.institution_type)}) · ${t('venuePicker.fromCatalog')}`,
      }));

    return [
      ...venueOpts,
      ...catalogOpts,
      { value: CREATE_OPTION, label: t('venuePicker.createNewVenue') },
    ];
  }, [data, selected, institutions, enumLabel, t]);

  const openFromCatalog = (institutionId: number) => {
    const inst = (institutions ?? []).find((i) => i.id === institutionId);
    if (!inst) return;
    setPrefill({
      name: inst.name,
      venue_type: institutionVenueType(inst),
      address: inst.address,
      city: inst.city,
      state: inst.state,
      country: inst.country ?? 'USA',
      latitude: inst.latitude,
      longitude: inst.longitude,
      institution_id: inst.id,
    });
    setCreating(true);
  };

  return (
    <>
      <Select
        label={t('venuePicker.venueLabel')}
        placeholder={t('venuePicker.searchPlaceholder')}
        searchable
        clearable
        data={options}
        // Results are already filtered server-side by `search`; disable Mantine's
        // own filtering so the "＋ Create new venue…" and catalog options are
        // never hidden just because their label doesn't contain the typed text.
        filter={({ options }) => options}
        value={value !== null ? String(value) : null}
        searchValue={search}
        onSearchChange={setSearch}
        error={error}
        nothingFoundMessage={t('venuePicker.nothingFound')}
        onChange={(picked) => {
          if (picked === CREATE_OPTION) {
            setPrefill(undefined);
            setCreating(true);
          } else if (picked?.startsWith(CATALOG_PREFIX)) {
            openFromCatalog(Number(picked.slice(CATALOG_PREFIX.length)));
          } else {
            onChange(picked ? Number(picked) : null);
          }
        }}
      />
      <VenueFormModal
        key={`${creating}-${prefill?.institution_id ?? 'new'}`}
        opened={creating}
        onClose={() => setCreating(false)}
        initialName={search}
        prefill={prefill}
        onSaved={(venue) => {
          queryClient.invalidateQueries({ queryKey: ['venues'] });
          onChange(venue.id);
          setCreating(false);
        }}
      />
    </>
  );
}

export interface VenuePrefill {
  name?: string;
  venue_type?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  institution_id?: number;
}

interface VenueFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSaved: (venue: Venue) => void;
  /** When provided, the modal edits this venue instead of creating a new one. */
  venue?: Venue;
  initialName?: string;
  /** Prefill a NEW venue's fields (e.g. from a catalog institution). */
  prefill?: VenuePrefill;
}

export function VenueFormModal({
  opened,
  onClose,
  onSaved,
  venue,
  initialName = '',
  prefill,
}: VenueFormModalProps) {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const editing = venue !== undefined;
  const [addressQuery, setAddressQuery] = useState('');
  const [debouncedAddressQuery] = useDebouncedValue(addressQuery, 400);

  const { data: suggestions } = useQuery({
    queryKey: ['geocode', debouncedAddressQuery],
    queryFn: () =>
      api.get<PlaceSuggestion[]>('/api/geocode/search', { q: debouncedAddressQuery }),
    enabled: debouncedAddressQuery.trim().length >= 2,
  });
  const suggestionByLabel = useMemo(() => {
    const map = new Map<string, PlaceSuggestion>();
    for (const s of suggestions ?? []) map.set(s.label, s);
    return map;
  }, [suggestions]);

  const form = useForm({
    initialValues: {
      name: venue?.name ?? prefill?.name ?? initialName,
      venue_type: venue?.venue_type ?? prefill?.venue_type ?? 'elementary_school',
      address: venue?.address ?? prefill?.address ?? '',
      city: venue?.city ?? prefill?.city ?? '',
      state: venue?.state ?? prefill?.state ?? '',
      country: venue?.country ?? prefill?.country ?? 'USA',
      latitude: (venue?.latitude ?? prefill?.latitude ?? '') as number | '',
      longitude: (venue?.longitude ?? prefill?.longitude ?? '') as number | '',
      notes: venue?.notes ?? '',
    },
    validate: {
      name: (v) => (v.trim().length > 0 ? null : t('venuePicker.validation.nameRequired')),
      venue_type: (v) => (v ? null : t('venuePicker.validation.typeRequired')),
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
        ...(editing ? {} : { institution_id: prefill?.institution_id ?? null }),
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
        title: editing ? t('venuePicker.couldNotSaveVenue') : t('venuePicker.couldNotCreateVenue'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? t('venuePicker.editVenueTitle') : t('venuePicker.newVenueTitle')}
      size="lg"
    >
      <form onSubmit={form.onSubmit((values) => save.mutate(values))}>
        <Stack>
          <Group grow>
            <TextInput
              label={t('venuePicker.nameLabel')}
              placeholder={t('venuePicker.namePlaceholder')}
              {...form.getInputProps('name')}
            />
            <Select
              label={t('venuePicker.typeLabel')}
              data={VENUE_TYPES.map((vt) => ({ value: vt, label: enumLabel.venueType(vt) }))}
              {...form.getInputProps('venue_type')}
            />
          </Group>
          <Autocomplete
            label={t('venuePicker.addressSearchLabel')}
            description={t('venuePicker.addressSearchDescription')}
            placeholder={t('venuePicker.addressSearchPlaceholder')}
            data={(suggestions ?? []).map((s) => s.label)}
            value={addressQuery}
            onChange={setAddressQuery}
            onOptionSubmit={(label) => {
              const s = suggestionByLabel.get(label);
              if (!s) return;
              form.setFieldValue('address', s.address ?? form.values.address);
              form.setFieldValue('city', s.city ?? form.values.city);
              form.setFieldValue('state', s.state ?? form.values.state);
              form.setFieldValue('country', s.country ?? form.values.country);
              form.setFieldValue('latitude', s.latitude);
              form.setFieldValue('longitude', s.longitude);
            }}
          />
          <TextInput label={t('venuePicker.streetAddressLabel')} {...form.getInputProps('address')} />
          <Group grow>
            <TextInput label={t('venuePicker.cityLabel')} {...form.getInputProps('city')} />
            <TextInput label={t('venuePicker.stateLabel')} {...form.getInputProps('state')} />
            <TextInput label={t('venuePicker.countryLabel')} {...form.getInputProps('country')} />
          </Group>
          <Group grow>
            <NumberInput
              label={t('venuePicker.latitudeLabel')}
              decimalScale={6}
              min={-90}
              max={90}
              {...form.getInputProps('latitude')}
            />
            <NumberInput
              label={t('venuePicker.longitudeLabel')}
              decimalScale={6}
              min={-180}
              max={180}
              {...form.getInputProps('longitude')}
            />
          </Group>
          <Textarea label={t('venuePicker.notesLabel')} autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? t('common.saveChanges') : t('venuePicker.createVenueButton')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
