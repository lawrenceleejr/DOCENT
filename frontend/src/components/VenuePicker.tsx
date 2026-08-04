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
import { useEffect, useMemo, useState } from 'react';
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

// The "schools you attended" picker should list places of education, not
// libraries/museums/community centers (#15).
const EDUCATIONAL_VENUE_TYPES = new Set([
  'elementary_school',
  'middle_school',
  'high_school',
  'community_college',
  'university',
]);

interface VenuePickerProps {
  value: number | null;
  onChange: (venueId: number | null) => void;
  error?: string;
  /** Restrict results to schools/colleges/universities (hides libraries etc.). */
  educationalOnly?: boolean;
  /** Seed the search box (e.g. a venue name from an imported CSV row). The
   * picker re-seeds whenever this changes and nothing is selected yet. */
  initialSearch?: string;
  disabled?: boolean;
  /** Show the required-field asterisk on the label. */
  required?: boolean;
}

export function VenuePicker({
  value,
  onChange,
  error,
  educationalOnly,
  initialSearch,
  disabled,
  required,
}: VenuePickerProps) {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const [search, setSearch] = useState(initialSearch ?? '');
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<VenuePrefill | undefined>();
  const queryClient = useQueryClient();

  // When the seed changes (the import wizard moved to another row) and no venue
  // is selected, restart the search from the new seed.
  useEffect(() => {
    if (value === null) setSearch(initialSearch ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch]);

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
    const venues = (data?.items ?? []).filter(
      (v) => !educationalOnly || EDUCATIONAL_VENUE_TYPES.has(v.venue_type),
    );
    const byId = new Map(venues.map((v) => [v.id, v]));
    // Always keep the current selection resolvable, even if it's off-filter.
    if (selected && !byId.has(selected.id)) byId.set(selected.id, selected);
    const venueOpts = [...byId.values()].map((v) => ({
      value: String(v.id),
      label: `${v.name}${v.city ? ` — ${v.city}` : ''} (${enumLabel.venueType(v.venue_type)})`,
    }));

    // The "schools you attended" picker lists only venues already in the
    // database (plus the create option) — no OSM-catalog suggestions (#15).
    const existingNames = new Set([...byId.values()].map((v) => v.name.toLowerCase()));
    const catalogOpts = educationalOnly
      ? []
      : (institutions ?? [])
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
  }, [data, selected, institutions, enumLabel, t, educationalOnly]);

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
        disabled={disabled}
        withAsterisk={required}
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
  // Mantine's Autocomplete uses each option's label as its value and throws
  // ("Duplicate options are not supported") mid-render if two share one —
  // which crashes the whole page. Photon readily returns several results that
  // reduce to the same label (e.g. multiple unnamed points on one street), so
  // key by label and keep the first (best-ranked) suggestion for each.
  const suggestionByLabel = useMemo(() => {
    const map = new Map<string, PlaceSuggestion>();
    for (const s of suggestions ?? []) {
      if (!map.has(s.label)) map.set(s.label, s);
    }
    return map;
  }, [suggestions]);
  const addressOptions = useMemo(() => [...suggestionByLabel.keys()], [suggestionByLabel]);

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
      url: venue?.url ?? '',
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
        url: values.url.trim() || null,
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
            data={addressOptions}
            value={addressQuery}
            onChange={setAddressQuery}
            onOptionSubmit={(label) => {
              const s = suggestionByLabel.get(label);
              if (!s) return;
              // Auto-fill the venue name from the chosen result so you don't
              // have to retype it (you can still edit it after). Prefer the
              // place's own name; if the result is a bare street address with
              // no place name, only fall back to the label when the name field
              // is still empty — never clobber a name you typed on purpose.
              if (s.name) {
                form.setFieldValue('name', s.name);
              } else if (!form.values.name.trim()) {
                form.setFieldValue('name', s.label);
              }
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
          <TextInput
            label={t('venuePicker.urlLabel')}
            description={t('venuePicker.urlDescription')}
            placeholder="https://…"
            inputMode="url"
            {...form.getInputProps('url')}
          />
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
