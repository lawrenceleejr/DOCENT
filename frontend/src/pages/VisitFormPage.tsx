import {
  ActionIcon,
  Button,
  Card,
  Checkbox,
  Collapse,
  Fieldset,
  Group,
  Input,
  NumberInput,
  Rating,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { DateInput, TimeInput } from '@mantine/dates';
import { IconChevronDown, IconChevronRight, IconPlus, IconTrash } from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
} from '../api/types';
import { useEnumLabel } from '../i18n/enumLabels';
import { VenuePicker } from '../components/VenuePicker';
import { toDateString } from './VisitListPage';

interface FormValues {
  venue_id: number | null;
  status: VisitStatus;
  visit_date: Date | null;
  start_time: string;
  event_type: string;
  title: string;
  description: string;
  audience_level: string;
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
  additional_presenters: string;
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

  const form = useForm<FormValues>({
    initialValues: {
      venue_id: null,
      status: initialStatus,
      visit_date: new Date(),
      start_time: '',
      event_type: 'classroom_visit',
      title: '',
      description: '',
      audience_level: '',
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
      additional_presenters: '',
      tags: [],
      links: [],
    },
    validate: {
      venue_id: (v) => (v !== null ? null : t('visitForm.validation.pickVenue')),
      visit_date: (v) => (v ? null : t('visitForm.validation.dateRequired')),
      title: (v) => (v.trim().length > 0 ? null : t('visitForm.validation.titleRequired')),
      event_type: (v) => (v ? null : t('visitForm.validation.eventTypeRequired')),
      audience_level: (v) => (v ? null : t('visitForm.validation.audienceRequired')),
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
        audience_level: existing.audience_level,
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
        additional_presenters: existing.additional_presenters ?? '',
        tags: existing.tags ?? [],
        links: (existing.links ?? []).map((l) => ({ ...l, label: l.label ?? '' })),
      });
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, editing]);

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
        audience_level: values.audience_level,
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
        additional_presenters: values.additional_presenters.trim() || null,
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
                onChange={(venueId) => form.setFieldValue('venue_id', venueId)}
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
              <Select
                label={t('visitForm.audienceLevelLabel')}
                placeholder={t('visitForm.audienceLevelPlaceholder')}
                data={AUDIENCE_LEVELS.map((v) => ({ value: v, label: enumLabel.audienceLevel(v) }))}
                {...form.getInputProps('audience_level')}
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
                <Rating size="lg" {...form.getInputProps('rating')} />
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

          {!isPlanned && (
          <Fieldset legend={t('visitForm.coverageLegend')} radius="md">
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                {t('visitForm.coverageDescription')}
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
                  form.insertListItem('links', { url: '', category: 'press', label: '' })
                }
              >
                {t('visitForm.addLink')}
              </Button>
            </Stack>
          </Fieldset>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => navigate(-1)}>
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
