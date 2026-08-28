// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Collapse,
  FileButton,
  Group,
  Kbd,
  Modal,
  NumberInput,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFileSpreadsheet,
  IconPlayerSkipForward,
  IconUpload,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import {
  AUDIENCE_LEVELS,
  EVENT_TYPES,
  LANGUAGES,
  type AdminUser,
  type EventType,
  type AudienceLevel,
  type ImportDraftRow,
  type ImportParseResponse,
  type Paginated,
  type VenueType,
  type Visit,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useEnumLabel } from '../i18n/enumLabels';
import { VenuePicker } from './VenuePicker';

// Online venue types default an imported row to remote/broadcast reach (#50),
// mirroring the main event form.
const ONLINE_VENUE_TYPES = new Set<VenueType>([
  'youtube_channel',
  'podcast',
  'social_media',
  'blog',
]);

/**
 * Who an imported event is logged for. `id: null` means the signed-in user —
 * the only possibility for a non-admin, and the default for everyone.
 */
interface Communicator {
  id: number | null;
  name: string | null;
}

const MYSELF: Communicator = { id: null, name: null };

/**
 * Admin-only picker for whose events these are. An admin handed a colleague's
 * CV can import the whole back-catalogue under the colleague's account: the
 * events become theirs for every purpose — their profile, their stats, their
 * reports, theirs to edit. Non-admins never see this control, and the API
 * refuses the attribution regardless of the UI.
 */
function CommunicatorSelect({
  value,
  onChange,
  label,
  description,
  disabled,
  size,
}: {
  value: Communicator;
  onChange: (who: Communicator) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  size?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Mantine echoes the selected option's label back through onSearchChange, so
  // the search box holds "Ada Alvarez" (or "Me (…)") whenever the dropdown is
  // shut. Sending that as the query would filter the list down to nobody, so
  // only search while the dropdown is open — where the text really was typed.
  const q = dropdownOpen ? search.trim() : '';

  const { data } = useQuery({
    queryKey: ['admin', 'users', 'attribution', q],
    queryFn: () =>
      api.get<Paginated<AdminUser>>('/api/admin/users', {
        q: q || undefined,
        page_size: 50,
      }),
  });

  // Only active accounts: a deactivated one can't own new events (the API
  // rejects it too). "Me" is offered separately as the first option.
  const candidates = useMemo(
    () => (data?.items ?? []).filter((u) => u.is_active && u.id !== user?.id),
    [data, user?.id],
  );

  const options = useMemo(() => {
    // Label with the bare name: picking an option feeds the label back as the
    // next search, and a name still matches the server-side search where
    // "Name — email" would find nothing. The email is only added to tell two
    // people with the same name apart.
    const seen = new Map<string, number>();
    for (const u of candidates) seen.set(u.name, (seen.get(u.name) ?? 0) + 1);
    const opts = [
      { value: 'me', label: t('importWizard.attributeSelf', { name: user?.name ?? '' }) },
      ...candidates.map((u) => ({
        value: String(u.id),
        label: (seen.get(u.name) ?? 0) > 1 ? `${u.name} — ${u.email}` : u.name,
      })),
    ];
    // Keep the current selection resolvable even when the search has moved on.
    if (value.id !== null && !candidates.some((u) => u.id === value.id)) {
      opts.push({ value: String(value.id), label: value.name ?? `#${value.id}` });
    }
    return opts;
  }, [candidates, value, user?.name, t]);

  return (
    <Select
      label={label}
      description={description}
      size={size}
      searchable
      disabled={disabled}
      data={options}
      // Results are already filtered server-side; don't re-filter locally
      // (that would hide "Me", whose label rarely matches the typed name).
      filter={({ options }) => options}
      value={value.id === null ? 'me' : String(value.id)}
      searchValue={search}
      onSearchChange={setSearch}
      // Open on the full list rather than on the selected name as a filter.
      onDropdownOpen={() => {
        setDropdownOpen(true);
        setSearch('');
      }}
      onDropdownClose={() => setDropdownOpen(false)}
      comboboxProps={{ withinPortal: true }}
      nothingFoundMessage={t('importWizard.attributeNothing')}
      onChange={(picked) => {
        if (!picked || picked === 'me') return onChange(MYSELF);
        const id = Number(picked);
        const hit = candidates.find((u) => u.id === id);
        onChange({ id, name: hit?.name ?? value.name ?? `#${id}` });
      }}
    />
  );
}

/** Editable working copy of one CSV row, plus its wizard state. */
interface WorkingRow {
  draft: ImportDraftRow;
  // Form fields (all editable; strings keep '' for empty).
  title: string;
  visit_date: Date | null;
  event_type: EventType | null;
  audience_level: AudienceLevel | null;
  people_reached: number | '';
  is_broadcast: boolean;
  // Whose event this becomes. null = the signed-in user (the only option for
  // non-admins); an id attributes the event to that communicator instead.
  author_id: number | null;
  author_name: string | null;
  venue_id: number | null;
  description: string;
  start_time: string;
  duration_minutes: number | '';
  language: string | null;
  presenters: string;
  status: 'pending' | 'imported' | 'skipped';
  createdVisitId: number | null;
}

function toWorking(draft: ImportDraftRow, author: Communicator): WorkingRow {
  return {
    draft,
    title: draft.title ?? '',
    visit_date: draft.visit_date ? new Date(`${draft.visit_date}T00:00:00`) : null,
    event_type: (draft.event_type as EventType | null) ?? null,
    audience_level: (draft.audience_level as AudienceLevel | null) ?? null,
    people_reached: draft.people_reached ?? '',
    is_broadcast: false,
    author_id: author.id,
    author_name: author.name,
    venue_id: null,
    description: draft.description ?? '',
    start_time: draft.start_time ?? '',
    duration_minutes: draft.duration_minutes ?? '',
    language: draft.language && (LANGUAGES as readonly string[]).includes(draft.language) ? draft.language : null,
    presenters: draft.presenters ?? '',
    status: 'pending',
    createdVisitId: null,
  };
}

/** Same field→column assignments, treating a missing field and '' alike. */
function mappingsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...fields].every((f) => (a[f] ?? '') === (b[f] ?? ''));
}

function isoDate(d: Date | null): string | null {
  if (!d) return null;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Same-day events already in the DB, to help spot duplicates before importing. */
function SameDayPanel({ date, highlightIds }: { date: string | null; highlightIds: Set<number> }) {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const { data } = useQuery({
    queryKey: ['visits', 'same-day', date],
    queryFn: () =>
      api.get<Paginated<Visit>>('/api/visits', {
        date_from: date,
        date_to: date,
        include_federated: false,
        page_size: 20,
      }),
    enabled: !!date,
  });

  if (!date) {
    return (
      <Text size="sm" c="dimmed">
        {t('importWizard.sameDayNeedsDate')}
      </Text>
    );
  }
  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t('importWizard.sameDayNone', { date })}
      </Text>
    );
  }
  return (
    <Stack gap={6}>
      <Group gap={6}>
        <IconAlertTriangle size={16} color="var(--mantine-color-yellow-6)" />
        <Text size="sm" fw={600}>
          {t('importWizard.sameDayHeading', { count: items.length, date })}
        </Text>
      </Group>
      {items.map((v) => (
        <Card key={v.id} withBorder p="xs" radius="sm">
          <Group gap="xs" wrap="nowrap" justify="space-between">
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {v.title}
                {highlightIds.has(v.id) && (
                  <Badge size="xs" ml={6} color="teal" variant="light">
                    {t('importWizard.justImportedBadge')}
                  </Badge>
                )}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {v.venue.name}
                {v.venue.city ? ` — ${v.venue.city}` : ''} · {enumLabel.eventType(v.event_type)} ·{' '}
                {v.author.name}
              </Text>
            </div>
            <Badge variant="light" size="sm">
              {v.people_reached.toLocaleString()}
            </Badge>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

/** Collapsible view of the raw CSV row, so nothing the mapping missed is lost. */
function RawRow({ raw }: { raw: Record<string, string> }) {
  const { t } = useTranslation();
  const [open, { toggle }] = useDisclosure(false);
  const entries = Object.entries(raw).filter(([, v]) => v && v.trim());
  if (entries.length === 0) return null;
  return (
    <div>
      <UnstyledButton onClick={toggle}>
        <Group gap={4}>
          {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Text size="xs" c="dimmed" fw={600}>
            {t('importWizard.rawRowToggle', { count: entries.length })}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <Table
          withRowBorders={false}
          verticalSpacing={2}
          mt={4}
          style={{ tableLayout: 'fixed' }}
        >
          <Table.Tbody>
            {entries.map(([k, v]) => (
              <Table.Tr key={k}>
                <Table.Td w="35%" p={2}>
                  <Text size="xs" c="dimmed" truncate>
                    {k}
                  </Text>
                </Table.Td>
                <Table.Td p={2}>
                  <Text size="xs" style={{ wordBreak: 'break-word' }}>
                    {v}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Collapse>
    </div>
  );
}

export function EventImportWizard({
  opened,
  onClose,
  onImported,
}: {
  opened: boolean;
  onClose: () => void;
  /** Called after at least one event was imported (to refresh profile stats). */
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ImportParseResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // The mapping the current `parsed.rows` were actually built with — compared
  // against `mapping` so edits in the dropdowns always trigger a re-parse.
  const [appliedMapping, setAppliedMapping] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<WorkingRow[]>([]);
  // Who the whole file is being imported for; each row starts here and can be
  // re-pointed individually during the review.
  const [importFor, setImportFor] = useState<Communicator>(MYSELF);
  const [current, setCurrent] = useState(0);
  // IDs of visits created in this session — so the same-day panel can tag them.
  const [createdIds, setCreatedIds] = useState<Set<number>>(new Set());

  const step: 'upload' | 'review' = rows.length === 0 ? 'upload' : 'review';

  const reset = useCallback(() => {
    setFile(null);
    setParsed(null);
    setMapping({});
    setAppliedMapping({});
    setRows([]);
    setImportFor(MYSELF);
    setCurrent(0);
    setCreatedIds(new Set());
  }, []);

  const parse = useMutation({
    mutationFn: async (args: { f: File; mappingOverride?: Record<string, string> }) => {
      const fd = new FormData();
      fd.append('file', args.f);
      if (args.mappingOverride) fd.append('mapping', JSON.stringify(args.mappingOverride));
      return api.postForm<ImportParseResponse>('/api/imports/events/parse', fd);
    },
    onSuccess: (resp, args) => {
      setParsed(resp);
      const applied = args.mappingOverride ?? resp.suggested_mapping;
      setMapping(applied);
      setAppliedMapping(applied);
      if (resp.rows.length === 0) {
        notifications.show({ color: 'yellow', message: t('importWizard.noRows') });
      }
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('importWizard.parseFailedTitle'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  const startReview = async () => {
    if (!parsed || !file) return;
    // The mapping dropdowns edit local state only — if they differ from the
    // mapping the current rows were parsed with, re-parse first so edits
    // always take effect (no separate "re-parse" step to forget).
    let resp = parsed;
    if (!mappingsEqual(mapping, appliedMapping)) {
      try {
        resp = await parse.mutateAsync({ f: file, mappingOverride: mapping });
      } catch {
        return; // parse.onError already showed the notification
      }
    }
    setRows(resp.rows.map((r) => toWorking(r, importFor)));
    setCurrent(0);
  };

  const patchRow = useCallback((idx: number, patch: Partial<WorkingRow>) => {
    setRows((cur) => cur.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const row = rows[current];

  const importedCount = rows.filter((r) => r.status === 'imported').length;
  const skippedCount = rows.filter((r) => r.status === 'skipped').length;
  const doneCount = importedCount + skippedCount;

  // A stray click outside, Escape, or the X shouldn't silently wipe an
  // in-progress import — confirm first when there's unhandled work (#49).
  const requestClose = () => {
    const unsaved = rows.length > 0 ? doneCount < rows.length : file !== null;
    if (unsaved && !window.confirm(t('importWizard.discardConfirm'))) return;
    reset();
    onClose();
  };

  const createVisit = useMutation({
    mutationFn: (r: WorkingRow) =>
      api.post<Visit>('/api/visits', {
        venue_id: r.venue_id,
        // null = mine; an id is an admin attributing the event to a colleague.
        author_id: r.author_id,
        status: 'completed',
        visit_date: isoDate(r.visit_date),
        start_time: r.start_time || null,
        event_type: r.event_type,
        title: r.title.trim(),
        description: r.description.trim() || null,
        people_reached: r.people_reached === '' ? 0 : r.people_reached,
        is_broadcast: r.is_broadcast,
        audience_level: r.audience_level,
        language: r.language,
        duration_minutes: r.duration_minutes === '' ? null : r.duration_minutes,
        additional_presenters: r.presenters.trim() || null,
        links: r.draft.url ? [{ url: r.draft.url, category: 'other', note: null }] : [],
      }),
    onSuccess: (visit, imported) => {
      setCreatedIds((cur) => new Set(cur).add(visit.id));
      patchRow(current, { status: 'imported', createdVisitId: visit.id });
      onImported();
      notifications.show({
        color: 'green',
        message:
          imported.author_id !== null
            ? t('importWizard.importedForNotification', {
                title: visit.title,
                name: visit.author.name,
              })
            : t('importWizard.importedNotification', { title: visit.title }),
      });
      goNextPending();
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('importWizard.importFailedTitle'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  const rowValid =
    !!row &&
    row.title.trim().length > 0 &&
    row.visit_date !== null &&
    row.event_type !== null &&
    row.audience_level !== null &&
    row.venue_id !== null;

  const goTo = useCallback(
    (idx: number) => {
      if (idx >= 0 && idx < rows.length) setCurrent(idx);
    },
    [rows.length],
  );

  const goNextPending = useCallback(() => {
    setCurrent((cur) => {
      // Prefer the next pending row after the current one; wrap to earlier
      // pending rows; stay put when none remain.
      const later = rows.findIndex((r, i) => i > cur && r.status === 'pending');
      if (later !== -1) return later;
      const earlier = rows.findIndex((r) => r.status === 'pending');
      return earlier !== -1 ? earlier : cur;
    });
  }, [rows]);

  const skip = () => {
    patchRow(current, { status: 'skipped' });
    goNextPending();
  };
  const unskip = () => patchRow(current, { status: 'pending' });

  // Keyboard shortcuts for the review step — never while typing in a field
  // (arrows keep their cursor behavior; Enter keeps submitting selects):
  //   ← / → (and ↑ / ↓)  move between rows
  //   S                   skip the current row
  //   Enter               import the current row and move to the next
  useEffect(() => {
    if (!opened || step !== 'review') return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      if (typing) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goTo(current - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goTo(current + 1);
      } else if (
        e.key.toLowerCase() === 's' &&
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat
      ) {
        if (row && row.status === 'pending') {
          e.preventDefault();
          skip();
        }
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
        // A focused button/link should keep its native Enter activation —
        // otherwise Enter would both click it and import, double-acting.
        if (tag === 'BUTTON' || tag === 'A') return;
        if (row && row.status === 'pending' && rowValid && !createVisit.isPending) {
          e.preventDefault();
          createVisit.mutate(row);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, step, current, goTo, row, rowValid, createVisit.isPending]);

  const currentDateIso = row ? isoDate(row.visit_date) : null;

  // Venue picker needs a search seed from the CSV so the communicator lands on
  // the right venue (or creates it) with minimal typing.
  const venueSeed = useMemo(() => {
    if (!row) return '';
    return row.draft.venue_name ?? '';
  }, [row]);

  const mappingRows = parsed
    ? parsed.mappable_fields.map((f) => ({
        field: f,
        column: mapping[f] ?? '',
      }))
    : [];

  const remap = (fieldName: string, column: string | null) => {
    const next = { ...mapping };
    if (column) next[fieldName] = column;
    else delete next[fieldName];
    setMapping(next);
  };

  return (
    <Modal
      opened={opened}
      onClose={requestClose}
      title={
        <Group gap="xs">
          <IconFileSpreadsheet size={20} />
          <Text fw={600}>{t('importWizard.title')}</Text>
          {parsed?.format === 'symplectic' && (
            <Badge variant="light" color="grape">
              {t('importWizard.symplecticBadge')}
            </Badge>
          )}
        </Group>
      }
      size={step === 'review' ? '90%' : 'lg'}
    >
      {step === 'upload' && (
        <Stack>
          <Text size="sm" c="dimmed">
            {t('importWizard.uploadIntro')}
          </Text>
          <Group>
            <FileButton onChange={(f) => { setFile(f); setParsed(null); if (f) parse.mutate({ f }); }} accept=".csv,text/csv,text/plain">
              {(props) => (
                <Button leftSection={<IconUpload size={16} />} loading={parse.isPending} {...props}>
                  {file ? t('importWizard.chooseAnother') : t('importWizard.chooseFile')}
                </Button>
              )}
            </FileButton>
            {file && (
              <Text size="sm" c="dimmed">
                {file.name}
              </Text>
            )}
          </Group>

          {parsed && (
            <>
              <Alert variant="light" color={parsed.format === 'symplectic' ? 'grape' : 'blue'}>
                {parsed.format === 'symplectic'
                  ? t('importWizard.detectedSymplectic', { count: parsed.rows.length })
                  : t('importWizard.detectedGeneric', { count: parsed.rows.length })}
              </Alert>

              {isAdmin && (
                <CommunicatorSelect
                  value={importFor}
                  onChange={setImportFor}
                  label={t('importWizard.attributeLabel')}
                  description={t('importWizard.attributeDescription')}
                />
              )}

              <Text size="sm" fw={600}>
                {t('importWizard.mappingHeading')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('importWizard.mappingHelp')}
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
                {mappingRows.map(({ field, column }) => (
                  <Select
                    key={field}
                    size="xs"
                    label={t(`importWizard.field.${field}`)}
                    placeholder={t('importWizard.notMapped')}
                    clearable
                    searchable
                    data={parsed.columns}
                    value={column || null}
                    onChange={(v) => remap(field, v)}
                  />
                ))}
              </SimpleGrid>
              <Group justify="flex-end">
                <Button
                  onClick={startReview}
                  disabled={parsed.rows.length === 0}
                  loading={parse.isPending}
                >
                  {t('importWizard.startReviewButton', { count: parsed.rows.length })}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      )}

      {step === 'review' && row && (
        <Stack gap="sm">
          {/* Progress + row navigation strip */}
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <Button
                variant="default"
                size="xs"
                leftSection={<IconArrowLeft size={14} />}
                disabled={current === 0}
                onClick={() => goTo(current - 1)}
              >
                {t('importWizard.prevButton')}
              </Button>
              <Button
                variant="default"
                size="xs"
                rightSection={<IconArrowRight size={14} />}
                disabled={current === rows.length - 1}
                onClick={() => goTo(current + 1)}
              >
                {t('importWizard.nextButton')}
              </Button>
              <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {t('importWizard.rowCounter', { current: current + 1, total: rows.length })}
              </Text>
            </Group>
            <Group gap={4} visibleFrom="sm">
              <Kbd size="xs">←</Kbd>
              <Kbd size="xs">→</Kbd>
              <Text size="xs" c="dimmed">
                {t('importWizard.kbdHint')}
              </Text>
              <Kbd size="xs">S</Kbd>
              <Text size="xs" c="dimmed">
                {t('importWizard.kbdHintSkip')}
              </Text>
              <Kbd size="xs">↵</Kbd>
              <Text size="xs" c="dimmed">
                {t('importWizard.kbdHintImport')}
              </Text>
            </Group>
          </Group>

          <Progress.Root size="lg">
            <Progress.Section
              value={(importedCount / rows.length) * 100}
              color="teal"
            >
              <Progress.Label>{importedCount > 0 ? importedCount : ''}</Progress.Label>
            </Progress.Section>
            <Progress.Section
              value={(skippedCount / rows.length) * 100}
              color="gray"
            >
              <Progress.Label>{skippedCount > 0 ? skippedCount : ''}</Progress.Label>
            </Progress.Section>
          </Progress.Root>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {/* Left: the editable draft */}
            <Stack gap="xs">
              <Group justify="space-between">
                <Group gap="xs">
                  <Text fw={600}>{t('importWizard.draftHeading')}</Text>
                  {row.author_id !== null && (
                    <Badge color="grape" variant="light">
                      {t('importWizard.forCommunicatorBadge', { name: row.author_name })}
                    </Badge>
                  )}
                </Group>
                {row.status === 'imported' && (
                  <Badge color="teal" leftSection={<IconCheck size={12} />}>
                    {t('importWizard.importedBadge')}
                  </Badge>
                )}
                {row.status === 'skipped' && (
                  <Badge color="gray">{t('importWizard.skippedBadge')}</Badge>
                )}
              </Group>

              {row.draft.warnings.includes('date_unparsed') && row.visit_date === null && (
                <Alert color="yellow" variant="light" p="xs">
                  <Trans
                    i18nKey="importWizard.dateUnparsedWarning"
                    values={{ raw: row.draft.date_raw }}
                    components={{ code: <Code /> }}
                  />
                </Alert>
              )}

              {isAdmin && (
                <CommunicatorSelect
                  value={{ id: row.author_id, name: row.author_name }}
                  onChange={(who) =>
                    patchRow(current, { author_id: who.id, author_name: who.name })
                  }
                  label={t('importWizard.rowAuthorLabel')}
                  disabled={row.status === 'imported'}
                />
              )}

              <TextInput
                label={t('importWizard.titleLabel')}
                withAsterisk
                value={row.title}
                disabled={row.status === 'imported'}
                onChange={(e) => patchRow(current, { title: e.currentTarget.value })}
              />
              <Group grow>
                <DateInput
                  label={t('importWizard.dateLabel')}
                  withAsterisk
                  valueFormat="YYYY-MM-DD"
                  placeholder="YYYY-MM-DD"
                  popoverProps={{ withinPortal: true }}
                  value={row.visit_date}
                  disabled={row.status === 'imported'}
                  onChange={(d) => patchRow(current, { visit_date: d })}
                />
                <Select
                  label={t('importWizard.eventTypeLabel')}
                  withAsterisk
                  data={EVENT_TYPES.map((v) => ({ value: v, label: enumLabel.eventType(v) }))}
                  value={row.event_type}
                  disabled={row.status === 'imported'}
                  onChange={(v) => patchRow(current, { event_type: (v as EventType) ?? null })}
                  searchable
                />
              </Group>
              <Group grow>
                <Select
                  label={t('importWizard.audienceLabel')}
                  withAsterisk
                  data={AUDIENCE_LEVELS.map((v) => ({ value: v, label: enumLabel.audienceLevel(v) }))}
                  value={row.audience_level}
                  disabled={row.status === 'imported'}
                  onChange={(v) => patchRow(current, { audience_level: (v as AudienceLevel) ?? null })}
                  searchable
                />
                <NumberInput
                  label={t('importWizard.peopleReachedLabel')}
                  min={0}
                  value={row.people_reached}
                  disabled={row.status === 'imported'}
                  onChange={(v) =>
                    patchRow(current, { people_reached: typeof v === 'number' ? v : '' })
                  }
                />
              </Group>
              <div>
                <VenuePicker
                  value={row.venue_id}
                  onChange={(venueId, venueType) =>
                    patchRow(current, {
                      venue_id: venueId,
                      // Prefill remote/broadcast from an online venue type (#50);
                      // the switch below lets the user override.
                      ...(venueType ? { is_broadcast: ONLINE_VENUE_TYPES.has(venueType) } : {}),
                    })
                  }
                  initialSearch={venueSeed}
                  disabled={row.status === 'imported'}
                  required
                />
                {row.draft.venue_name && row.venue_id === null && (
                  <Text size="xs" c="dimmed" mt={2}>
                    {t('importWizard.venueFromCsv', {
                      name: row.draft.venue_name,
                      city: row.draft.venue_city ? ` (${row.draft.venue_city})` : '',
                    })}
                  </Text>
                )}
              </div>
              <Textarea
                label={t('importWizard.descriptionLabel')}
                autosize
                minRows={2}
                maxRows={5}
                value={row.description}
                disabled={row.status === 'imported'}
                onChange={(e) => patchRow(current, { description: e.currentTarget.value })}
              />
              <Switch
                label={t('visitForm.broadcastLabel')}
                description={t('visitForm.broadcastDescription')}
                checked={row.is_broadcast}
                disabled={row.status === 'imported'}
                onChange={(e) => patchRow(current, { is_broadcast: e.currentTarget.checked })}
              />
              <RawRow raw={row.draft.raw} />
            </Stack>

            {/* Right: same-day events (duplicate spotting) + actions */}
            <Stack gap="xs">
              <Text fw={600}>{t('importWizard.sameDayTitle')}</Text>
              <Card withBorder p="sm" style={{ minHeight: 120 }}>
                <SameDayPanel date={currentDateIso} highlightIds={createdIds} />
              </Card>

              <Group mt="auto" justify="flex-end">
                {row.status === 'pending' ? (
                  <>
                    <Button
                      variant="default"
                      leftSection={<IconPlayerSkipForward size={16} />}
                      onClick={skip}
                    >
                      {t('importWizard.skipButton')}
                    </Button>
                    <Tooltip
                      label={t('importWizard.missingRequired')}
                      disabled={rowValid}
                      withArrow
                    >
                      <Button
                        leftSection={<IconCheck size={16} />}
                        disabled={!rowValid}
                        loading={createVisit.isPending}
                        onClick={() => createVisit.mutate(row)}
                      >
                        {t('importWizard.importButton')}
                      </Button>
                    </Tooltip>
                  </>
                ) : row.status === 'skipped' ? (
                  <Button variant="default" onClick={unskip}>
                    {t('importWizard.unskipButton')}
                  </Button>
                ) : (
                  <Text size="sm" c="dimmed">
                    {t('importWizard.alreadyImportedNote')}
                  </Text>
                )}
              </Group>
            </Stack>
          </SimpleGrid>

          <Group justify="space-between">
            <Button variant="subtle" color="gray" size="xs" onClick={reset}>
              {t('importWizard.startOverButton')}
            </Button>
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                {t('importWizard.doneCounter', {
                  done: doneCount,
                  total: rows.length,
                  imported: importedCount,
                  skipped: skippedCount,
                })}
              </Text>
              <Button
                variant={doneCount === rows.length ? 'filled' : 'default'}
                onClick={requestClose}
              >
                {doneCount === rows.length
                  ? t('importWizard.finishButton')
                  : t('importWizard.closeButton')}
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
