import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Card,
  Checkbox,
  Collapse,
  Fieldset,
  Group,
  Input,
  MultiSelect,
  NumberInput,
  Rating,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { DateInput, TimeInput } from '@mantine/dates';
import {
  IconChevronDown,
  IconChevronRight,
  IconCircleOff,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  AUDIENCE_LEVELS,
  COVERAGE_CATEGORIES,
  EVENT_TYPES,
  HOST_RELATIONSHIPS,
  LANGUAGES,
  MAX_PEOPLE_REACHED,
  PEOPLE_REACHED_CONFIRM_THRESHOLD,
  type CoverageLink,
  type Visit,
  type VisitStatus,
  type VenueType,
} from '../api/types';
import { useEnumLabel } from '../i18n/enumLabels';
import { CoPresenterPicker } from '../components/CoPresenterPicker';
import { VenuePicker } from '../components/VenuePicker';
import { confirmLeave, useUnsavedGuard } from '../components/useUnsavedGuard';
import { toDateString } from './VisitListPage';

// Online venue types default to remote/broadcast reach on the form (#38).
const ONLINE_VENUE_TYPES = new Set<VenueType>([
  'youtube_channel',
  'podcast',
  'social_media',
  'blog',
]);

interface FormValues {
  venue_id: number | null;
  status: VisitStatus;
  visit_date: Date | null;
  start_time: string;
  event_type: string;
  title: string;
  description: string;
  audience_levels: string[];
  language: string | null;
  people_reached: number | '';
  duration_minutes: number | '';
  contact_name: string;
  host_role: string;
  host_relationship: string;
  host_relationship_detail: string;
  contact_email: string;
  contact_phone: string;
  host_notes: string;
  rating: number;
  reflection: string;
  follow_up_planned: boolean;
  is_broadcast: boolean;
  additional_presenters: string;
  co_presenter_user_ids: number[];
  tags: string[];
  links: CoverageLink[];
}

export function VisitFormPage() {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [hostOpen, host] = useDisclosure(false);
  const initialStatus: VisitStatus =
    searchParams.get('status') === 'planned' ? 'planned' : 'completed';

  const { data: existing } = useQuery({
    queryKey: ['visits', id],
    queryFn: () => api.get<Visit>(`/api/visits/${id}`),
    enabled: editing,
  });

  const { data: tagOptions = [] } = useQuery({
    queryKey: ['visits', 'tags'],
    queryFn: () => api.get<string[]>('/api/visits/tags'),
  });

  // Once the user toggles the broadcast switch, stop auto-prefilling it
  // from the venue type (#38).
  const broadcastTouched = useRef(false);
  const form = useForm<FormValues>({
    initialValues: {
      venue_id: null,
      status: initialStatus,
      visit_date: new Date(),
      start_time: '',
      event_type: 'classroom_visit',
      title: '',
      description: '',
      audience_levels: [],
      language: null,
      people_reached: '',
      duration_minutes: '',
      contact_name: '',
      host_role: '',
      host_relationship: '',
      host_relationship_detail: '',
      contact_email: '',
      contact_phone: '',
      host_notes: '',
      rating: 0,
      reflection: '',
      follow_up_planned: false,
      is_broadcast: false,
      additional_presenters: '',
      co_presenter_user_ids: [] as number[],
      tags: [],
      links: [],
    },
    validate: {
      venue_id: (v) => (v !== null ? null : t('visitForm.validation.pickVenue')),
      visit_date: (v) => (v ? null : t('visitForm.validation.dateRequired')),
      title: (v) => (v.trim().length > 0 ? null : t('visitForm.validation.titleRequired')),
      event_type: (v) => (v ? null : t('visitForm.validation.eventTypeRequired')),
      audience_levels: (v: string[]) =>
        v && v.length > 0 ? null : t('visitForm.validation.audienceRequired'),
      // Attendance is only required for a completed visit; a planned event may
      // leave it blank until it happens.
      people_reached: (v, values) => {
        const max = MAX_PEOPLE_REACHED.toLocaleString();
        if (values.status === 'planned') {
          return v !== '' && v > MAX_PEOPLE_REACHED
            ? t('visitForm.validation.peopleReachedTooLarge', { max })
            : null;
        }
        if (v === '' || v < 0) return t('visitForm.validation.peopleReachedRequired');
        if (v > MAX_PEOPLE_REACHED)
          return t('visitForm.validation.peopleReachedTooLargeTypo', { max });
        return null;
      },
    },
  });

  useEffect(() => {
    if (existing) {
      form.setValues({
        venue_id: existing.venue.id,
        status: existing.status,
        visit_date: new Date(`${existing.visit_date}T00:00:00`),
        start_time: existing.start_time ? existing.start_time.slice(0, 5) : '',
        event_type: existing.event_type,
        title: existing.title,
        description: existing.description ?? '',
        audience_levels: existing.audience_levels ?? [existing.audience_level],
        language: existing.language,
        people_reached: existing.people_reached,
        duration_minutes: existing.duration_minutes ?? '',
        contact_name: existing.contact_name ?? '',
        host_role: existing.host_role ?? '',
        host_relationship: existing.host_relationship ?? '',
        host_relationship_detail: existing.host_relationship_detail ?? '',
        contact_email: existing.contact_email ?? '',
        contact_phone: existing.contact_phone ?? '',
        host_notes: existing.host_notes ?? '',
        rating: existing.rating ?? 0,
        reflection: existing.reflection ?? '',
        follow_up_planned: existing.follow_up_planned,
        is_broadcast: existing.is_broadcast,
        additional_presenters: existing.additional_presenters ?? '',
        co_presenter_user_ids: (existing.co_presenters ?? []).map((u) => u.id),
        tags: existing.tags ?? [],
        links: (existing.links ?? []).map((l) => ({ ...l, label: l.label ?? '' })),
      });
      broadcastTouched.current = true;
      // Loading an existing visit is not a user edit — rebaseline so the
      // unsaved-changes guard only trips on real changes (#11).
      form.resetDirty();
      if (
        existing.contact_name ||
        existing.contact_email ||
        existing.contact_phone ||
        existing.host_role ||
        existing.host_relationship ||
        existing.host_notes
      ) {
        host.open();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  // Preselect a venue when arriving from the map's "Log a visit here".
  useEffect(() => {
    const venueParam = searchParams.get('venue');
    if (!editing && venueParam) {
      form.setFieldValue('venue_id', Number(venueParam));
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, editing]);

  // Warn before navigating away from a form with unsaved edits (#11).
  useUnsavedGuard(form.isDirty());

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        venue_id: values.venue_id,
        status: values.status,
        visit_date: toDateString(values.visit_date!),
        start_time: values.start_time || null,
        event_type: values.event_type,
        title: values.title.trim(),
        description: values.description.trim() || null,
        audience_levels: values.audience_levels,
        language: values.language || null,
        people_reached: values.people_reached === '' ? 0 : values.people_reached,
        duration_minutes: values.duration_minutes === '' ? null : values.duration_minutes,
        contact_name: values.contact_name.trim() || null,
        host_role: values.host_role.trim() || null,
        host_relationship: values.host_relationship || null,
        host_relationship_detail: values.host_relationship_detail.trim() || null,
        contact_email: values.contact_email.trim() || null,
        contact_phone: values.contact_phone.trim() || null,
        host_notes: values.host_notes.trim() || null,
        rating: values.rating || null,
        reflection: values.reflection.trim() || null,
        follow_up_planned: values.follow_up_planned,
        is_broadcast: values.is_broadcast,
        additional_presenters: values.additional_presenters.trim() || null,
        co_presenter_user_ids: values.co_presenter_user_ids,
        tags: values.tags,
        links: values.links
          .filter((l) => l.url.trim())
          .map((l) => ({ url: l.url.trim(), category: l.category, label: l.label })),
      };
      return editing
        ? api.patch<Visit>(`/api/visits/${id}`, payload)
        : api.post<Visit>('/api/visits', payload);
    },
    onSuccess: (visit) => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate(`/visits/${visit.id}`);
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: editing ? t('visitForm.couldNotSaveTitle') : t('visitForm.couldNotLogTitle'),
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  const isPlanned = form.values.status === 'planned';
  const heading = editing
    ? t('visitForm.editTitle')
    : isPlanned
      ? t('visitForm.scheduleTitle')
      : t('visitForm.logTitle');
  const subtitle = editing
    ? t('visitForm.editSubtitle')
    : isPlanned
      ? t('visitForm.scheduleSubtitle')
      : t('visitForm.logSubtitle');

  return (
    <Stack maw={760} mx="auto">
      <div>
        <Title order={2}>{heading}</Title>
        <Text c="dimmed" size="sm">
          {subtitle}
        </Text>
      </div>
      <form
        onSubmit={form.onSubmit((values) => {
          const count = values.people_reached === '' ? 0 : values.people_reached;
          if (
            count > PEOPLE_REACHED_CONFIRM_THRESHOLD &&
            !window.confirm(
              t('visitForm.confirmLargeCount', { count: count.toLocaleString() }),
            )
          ) {
            return;
          }
          save.mutate(values);
        })}
      >
        <Stack>
          {!editing && (
            // Point people at the map as an alternative way to start an event (#8).
            <Text size="sm" c="dimmed">
              {t('visitForm.mapHintText')}{' '}
              <Anchor component={Link} to="/map">
                {t('visitForm.mapHintLink')}
              </Anchor>
              .
            </Text>
          )}
          <Fieldset legend={t('visitForm.statusVenueLegend')} radius="md">
            <Stack>
              <Input.Wrapper label={t('visitForm.statusLabel')}>
                <div>
                  <SegmentedControl
                    data={[
                      { label: t('visitForm.statusPlanned'), value: 'planned' },
                      { label: t('visitForm.statusCompleted'), value: 'completed' },
                    ]}
                    {...form.getInputProps('status')}
                  />
                </div>
              </Input.Wrapper>
              <VenuePicker
                value={form.values.venue_id}
                onChange={(venueId, venueType) => {
                  form.setFieldValue('venue_id', venueId);
                  // Prefill the broadcast flag from an online venue type, unless
                  // the user has already set it by hand (#38).
                  if (!broadcastTouched.current && venueType) {
                    form.setFieldValue('is_broadcast', ONLINE_VENUE_TYPES.has(venueType));
                  }
                }}
                error={form.errors.venue_id as string | undefined}
              />
            </Stack>
          </Fieldset>

          <Fieldset legend={t('visitForm.eventDetailsLegend')} radius="md">
            <Stack>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <DateInput
                label={t('visitForm.dateLabel')}
                valueFormat="YYYY-MM-DD"
                placeholder="YYYY-MM-DD"
                popoverProps={{ withinPortal: true }}
                {...form.getInputProps('visit_date')}
              />
              <TimeInput
                label={t('visitForm.startTimeLabel')}
                {...form.getInputProps('start_time')}
              />
              <Select
                label={t('visitForm.eventTypeLabel')}
                data={EVENT_TYPES.map((v) => ({ value: v, label: enumLabel.eventType(v) }))}
                {...form.getInputProps('event_type')}
              />
            </SimpleGrid>
            <TextInput
              label={t('visitForm.titleLabel')}
              placeholder={t('visitForm.titlePlaceholder')}
              {...form.getInputProps('title')}
            />
            <Textarea
              label={t('visitForm.descriptionLabel')}
              placeholder={t('visitForm.descriptionPlaceholder')}
              autosize
              minRows={2}
              {...form.getInputProps('description')}
            />
            <SimpleGrid cols={{ base: 1, sm: isPlanned ? 2 : 3 }}>
              <MultiSelect
                label={t('visitForm.audienceLevelLabel')}
                placeholder={
                  form.values.audience_levels.length === 0
                    ? t('visitForm.audienceLevelPlaceholder')
                    : undefined
                }
                data={AUDIENCE_LEVELS.map((v) => ({ value: v, label: enumLabel.audienceLevel(v) }))}
                searchable
                clearable
                {...form.getInputProps('audience_levels')}
              />
              {/* Attendance isn't known until the event happens — hidden while planned. */}
              {!isPlanned && (
                <NumberInput
                  label={t('visitForm.peopleReachedLabel')}
                  min={0}
                  placeholder={t('visitForm.peopleReachedPlaceholder')}
                  {...form.getInputProps('people_reached')}
                />
              )}
              <NumberInput
                label={t('visitForm.durationLabel')}
                min={0}
                step={15}
                placeholder={t('visitForm.durationPlaceholder')}
                {...form.getInputProps('duration_minutes')}
              />
            </SimpleGrid>
            <Select
              label={t('visitForm.languageLabel')}
              placeholder={t('visitForm.languagePlaceholder')}
              searchable
              clearable
              data={LANGUAGES}
              {...form.getInputProps('language')}
            />
            <Tooltip
              label={t('visitForm.broadcastTooltip')}
              multiline
              w={300}
              withArrow
              position="top-start"
              events={{ hover: true, focus: true, touch: true }}
            >
              <Box w="fit-content">
                <Switch
                  label={t('visitForm.broadcastLabel')}
                  description={t('visitForm.broadcastDescription')}
                  checked={form.values.is_broadcast}
                  onChange={(e) => {
                    broadcastTouched.current = true;
                    form.setFieldValue('is_broadcast', e.currentTarget.checked);
                  }}
                />
              </Box>
            </Tooltip>
            <CoPresenterPicker
              value={form.values.co_presenter_user_ids}
              onChange={(ids) => form.setFieldValue('co_presenter_user_ids', ids)}
              initialUsers={existing?.co_presenters}
            />
            <TextInput
              label={t('visitForm.additionalPresentersLabel')}
              placeholder={t('visitForm.additionalPresentersPlaceholder')}
              description={isPlanned ? undefined : t('visitForm.additionalPresentersDescription')}
              {...form.getInputProps('additional_presenters')}
            />
            <TagsInput
              label={t('visitForm.tagsLabel')}
              description={t('visitForm.tagsDescription')}
              placeholder={t('visitForm.tagsPlaceholder')}
              data={tagOptions}
              clearable
              {...form.getInputProps('tags')}
            />
            </Stack>
          </Fieldset>

          <Fieldset legend={t('visitForm.hostLegend')} radius="md">
            <UnstyledButton onClick={host.toggle} c="brand" fz="sm" fw={600}>
              {hostOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}{' '}
              {t('visitForm.addHostDetails')}
            </UnstyledButton>
            <Collapse in={hostOpen}>
              <Stack gap="sm" mt="sm">
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <TextInput
                    label={t('visitForm.hostNameLabel')}
                    placeholder={t('visitForm.hostNamePlaceholder')}
                    {...form.getInputProps('contact_name')}
                  />
                  <TextInput
                    label={t('visitForm.hostRoleLabel')}
                    placeholder={t('visitForm.hostRolePlaceholder')}
                    {...form.getInputProps('host_role')}
                  />
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select
                    label={t('visitForm.relationshipLabel')}
                    placeholder={t('visitForm.relationshipPlaceholder')}
                    clearable
                    data={HOST_RELATIONSHIPS.map((r) => ({ value: r, label: enumLabel.hostRelationship(r) }))}
                    {...form.getInputProps('host_relationship')}
                  />
                  <TextInput
                    label={t('visitForm.relationshipDetailLabel')}
                    placeholder={t('visitForm.relationshipDetailPlaceholder')}
                    {...form.getInputProps('host_relationship_detail')}
                  />
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <TextInput label={t('visitForm.emailLabel')} {...form.getInputProps('contact_email')} />
                  <TextInput label={t('visitForm.phoneLabel')} {...form.getInputProps('contact_phone')} />
                </SimpleGrid>
                <Textarea
                  label={t('visitForm.hostNotesLabel')}
                  placeholder={t('visitForm.hostNotesPlaceholder')}
                  autosize
                  minRows={2}
                  {...form.getInputProps('host_notes')}
                />
              </Stack>
            </Collapse>
          </Fieldset>

          {/* Outcome fields only make sense once the event has happened — they
              appear automatically when the visit is marked Completed. */}
          {!isPlanned && (
          <Fieldset legend={t('visitForm.outcomeLegend')} radius="md">
            <Stack>
              <Input.Wrapper label={t('visitForm.howDidItGo')}>
                <Group gap="sm" align="center">
                  <Rating size="lg" {...form.getInputProps('rating')} />
                  {form.values.rating > 0 && (
                    // A star rating can't be un-clicked, so offer an explicit
                    // "no rating" reset via a slashed-circle icon (#10).
                    <Tooltip label={t('common.clear')}>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={t('common.clear')}
                        onClick={() => form.setFieldValue('rating', 0)}
                      >
                        <IconCircleOff size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Input.Wrapper>
              <Textarea
                label={t('visitForm.reflectionLabel')}
                placeholder={t('visitForm.reflectionPlaceholder')}
                autosize
                minRows={2}
                {...form.getInputProps('reflection')}
              />
              <Checkbox
                label={t('visitForm.followUpLabel')}
                {...form.getInputProps('follow_up_planned', { type: 'checkbox' })}
              />
            </Stack>
          </Fieldset>
          )}

          {/* Links apply to planned events too — an agenda/website link or the
              slides exist before the event happens (no longer completed-only). */}
          <Fieldset legend={t('visitForm.coverageLegend')} radius="md">
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                {isPlanned
                  ? t('visitForm.coverageDescriptionPlanned')
                  : t('visitForm.coverageDescription')}
              </Text>
              {/* Desktop: compact single-row editor (unchanged). */}
              <Stack gap="xs" visibleFrom="sm">
                {form.values.links.map((_, i) => (
                  <Group key={i} gap="xs" align="flex-end" wrap="nowrap">
                    <Select
                      label={i === 0 ? t('visitForm.linkTypeLabel') : undefined}
                      w={140}
                      allowDeselect={false}
                      data={COVERAGE_CATEGORIES.map((c) => ({ value: c, label: enumLabel.coverageCategory(c) }))}
                      {...form.getInputProps(`links.${i}.category`)}
                    />
                    <TextInput
                      label={i === 0 ? t('visitForm.linkUrlLabel') : undefined}
                      placeholder={t('visitForm.linkUrlPlaceholder')}
                      style={{ flex: 1 }}
                      {...form.getInputProps(`links.${i}.url`)}
                    />
                    <TextInput
                      label={i === 0 ? t('visitForm.linkLabelLabel') : undefined}
                      placeholder={t('visitForm.linkLabelPlaceholder')}
                      w={200}
                      {...form.getInputProps(`links.${i}.label`)}
                    />
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="lg"
                      aria-label={t('visitForm.removeLinkAria')}
                      onClick={() => form.removeListItem('links', i)}
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>

              {/* Mobile: each link as its own stacked mini-card — a single
                  cramped row doesn't fit a phone width, so fields get room to
                  breathe and "Remove" is a real tap target. */}
              <Stack gap="sm" hiddenFrom="sm">
                {form.values.links.map((_, i) => (
                  <Card key={i} withBorder p="sm" radius="md">
                    <Stack gap="xs">
                      <Select
                        label={t('visitForm.linkTypeLabel')}
                        allowDeselect={false}
                        data={COVERAGE_CATEGORIES.map((c) => ({ value: c, label: enumLabel.coverageCategory(c) }))}
                        {...form.getInputProps(`links.${i}.category`)}
                      />
                      <TextInput
                        label={t('visitForm.linkUrlLabel')}
                        placeholder={t('visitForm.linkUrlPlaceholder')}
                        {...form.getInputProps(`links.${i}.url`)}
                      />
                      <TextInput
                        label={t('visitForm.linkLabelLabel')}
                        placeholder={t('visitForm.linkLabelPlaceholder')}
                        {...form.getInputProps(`links.${i}.label`)}
                      />
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        leftSection={<IconTrash size={14} />}
                        style={{ alignSelf: 'flex-start' }}
                        onClick={() => form.removeListItem('links', i)}
                      >
                        {t('visitForm.removeLink')}
                      </Button>
                    </Stack>
                  </Card>
                ))}
              </Stack>
              <Button
                variant="light"
                leftSection={<IconPlus size={16} />}
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  // Before the event the natural link is its website/agenda;
                  // after, press coverage.
                  form.insertListItem('links', {
                    url: '',
                    category: isPlanned ? 'website' : 'press',
                    label: '',
                  })
                }
              >
                {t('visitForm.addLink')}
              </Button>
            </Stack>
          </Fieldset>

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                if (confirmLeave(form.isDirty(), t('common.unsavedConfirm'))) navigate(-1);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="gradient" loading={save.isPending}>
              {editing
                ? t('common.saveChanges')
                : isPlanned
                  ? t('visitForm.scheduleEvent')
                  : t('visitForm.logVisitSubmit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
