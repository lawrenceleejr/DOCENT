import {
  Anchor,
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCalendarPlus,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { api, buildQuery } from '../api/client';
import {
  AUDIENCE_LEVELS,
  EVENT_TYPES,
  isOverdue,
  VENUE_TYPES,
  type ActivityListItem,
  type AuthConfig,
  type Paginated,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { usePageTitle } from '../components/usePageTitle';
import { FilterCard } from '../components/FilterCard';
import { QueryError } from '../components/QueryError';
import { filterParams, visitFilterChips, type VisitFilters } from '../components/filters';
import { useEnumLabel } from '../i18n/enumLabels';
import { toDateString, VisitCard } from './VisitListPage';

export function SchedulePage() {
  const { t } = useTranslation();
  usePageTitle(t('schedule.title'));
  const enumLabel = useEnumLabel();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<VisitFilters>({});
  const [mineOnly, setMineOnly] = useState(false);
  const [showSiblings, setShowSiblings] = useState(true);

  // Only offer the sibling-instances scope when this instance actually
  // federates; otherwise the control is meaningless noise (#6).
  const { data: config } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/api/auth/config'),
    staleTime: 5 * 60 * 1000,
  });
  const hasSiblings = !!config?.has_siblings;

  const update = (patch: Partial<VisitFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const params = {
    ...filterParams(filters),
    status: 'planned',
    author_id: mineOnly ? user?.id : undefined,
    // Siblings that opt into publishing planned events appear here too; the
    // mine-only scope keeps them out (the feed can't satisfy an author filter).
    include_federated: showSiblings && !mineOnly && hasSiblings,
    sort: 'visit_date', // soonest first
    page_size: 100,
  };
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['visits', 'schedule', params],
    queryFn: () => api.get<Paginated<ActivityListItem>>('/api/visits', params),
    enabled: !!user,
  });

  const { data: tagOptions = [] } = useQuery({
    queryKey: ['visits', 'tags'],
    queryFn: () => api.get<string[]>('/api/visits/tags'),
  });

  // The .ics export mirrors what's on screen (scope + filters). Siblings are
  // never in the file (they live on other instances), so the local rows are
  // what determines whether there's anything to export at all (issue #25).
  const exportableCount = (data?.items ?? []).filter((it) => it.source === 'local').length;
  const icsHref = `/api/visits/calendar.ics${buildQuery({
    ...filterParams(filters),
    status: 'planned',
    ...(mineOnly ? { author_id: user?.id } : { everyone: true }),
  })}`;

  const activeFilterCount =
    [filters.date_from, filters.date_to, filters.venue_type, filters.event_type,
      filters.audience_level].filter(Boolean).length +
    ((filters.tags?.length ?? 0) > 0 ? 1 : 0) +
    (mineOnly ? 1 : 0);

  // Live calendar subscription (#feed): unlike the one-shot .ics download, a
  // subscribed URL stays in sync as events change. The signed token is fetched
  // only when the dialog opens.
  const [subOpened, { open: openSub, close: closeSub }] = useDisclosure(false);
  const { data: feed } = useQuery({
    queryKey: ['users', 'me', 'calendar-feed'],
    queryFn: () => api.get<{ path: string }>('/api/users/me/calendar-feed'),
    enabled: subOpened,
  });
  const feedUrl = feed ? `${window.location.origin}${feed.path}` : '';
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:');

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>{t('schedule.title')}</Title>
          <Text c="dimmed" size="sm">
            {t('schedule.subtitle')}
          </Text>
        </div>
        <Group>
          {/* One calendar button. Subscribing is what almost everyone wants
              (it stays in sync); the one-shot .ics download lives inside the
              dialog rather than competing with it out here. */}
          <Button variant="default" leftSection={<IconCalendarPlus size={16} />} onClick={openSub}>
            {t('schedule.addToCalendar')}
          </Button>
          <Button variant="gradient" onClick={() => navigate('/visits/new?status=planned')}>
            {t('schedule.scheduleEvent')}
          </Button>
        </Group>
      </Group>

      <Modal opened={subOpened} onClose={closeSub} title={t('schedule.subscribeModalTitle')} centered>
        <Stack gap="sm">
          <Text size="sm">{t('schedule.subscribeExplainer')}</Text>
          <Group gap="xs" wrap="nowrap" align="flex-end">
            <TextInput
              style={{ flex: 1 }}
              readOnly
              value={webcalUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <CopyButton value={webcalUrl}>
              {({ copied, copy }) => (
                <Button
                  variant={copied ? 'light' : 'default'}
                  color={copied ? 'teal' : undefined}
                  leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  onClick={copy}
                >
                  {copied ? t('schedule.subscribeCopied') : t('schedule.subscribeCopy')}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Text size="xs" c="dimmed">
            {t('schedule.subscribePrivacyNote')}
          </Text>
          <Divider label={t('schedule.orOneTime')} labelPosition="center" />
          <Tooltip
            label={
              exportableCount === 0
                ? t('schedule.addToCalendarEmpty')
                : t('schedule.addToCalendarTooltip')
            }
          >
            <Button
              component="a"
              href={exportableCount === 0 ? undefined : icsHref}
              variant="default"
              disabled={exportableCount === 0}
              leftSection={<IconDownload size={16} />}
              style={{ alignSelf: 'flex-start' }}
            >
              {t('schedule.downloadIcs')}
            </Button>
          </Tooltip>
        </Stack>
      </Modal>

      <FilterCard
        activeCount={activeFilterCount}
        activeChips={visitFilterChips(filters, update, {
          venueType: enumLabel.venueType,
          eventType: enumLabel.eventType,
          audienceLevel: enumLabel.audienceLevel,
          from: t('schedule.fromLabel'),
          to: t('schedule.toLabel'),
        })}
      >
        <Group align="flex-end">
          <DateInput
            label={t('schedule.fromLabel')}
            placeholder={t('common.any')}
            clearable
            valueFormat="YYYY-MM-DD"
            value={filters.date_from ? new Date(`${filters.date_from}T00:00:00`) : null}
            onChange={(d) => update({ date_from: d ? toDateString(d) : undefined })}
          />
          <DateInput
            label={t('schedule.toLabel')}
            placeholder={t('common.any')}
            clearable
            valueFormat="YYYY-MM-DD"
            value={filters.date_to ? new Date(`${filters.date_to}T00:00:00`) : null}
            onChange={(d) => update({ date_to: d ? toDateString(d) : undefined })}
          />
          <Select
            label={t('schedule.venueTypeLabel')}
            placeholder={t('common.all')}
            clearable
            data={VENUE_TYPES.map((v) => ({ value: v, label: enumLabel.venueType(v) }))}
            value={filters.venue_type || null}
            onChange={(v) => update({ venue_type: (v ?? '') as VisitFilters['venue_type'] })}
          />
          <Select
            label={t('schedule.eventTypeLabel')}
            placeholder={t('common.all')}
            clearable
            data={EVENT_TYPES.map((v) => ({ value: v, label: enumLabel.eventType(v) }))}
            value={filters.event_type || null}
            onChange={(v) => update({ event_type: (v ?? '') as VisitFilters['event_type'] })}
          />
          <Select
            label={t('schedule.audienceLabel')}
            placeholder={t('common.all')}
            clearable
            data={AUDIENCE_LEVELS.map((v) => ({ value: v, label: enumLabel.audienceLevel(v) }))}
            value={filters.audience_level || null}
            onChange={(v) =>
              update({ audience_level: (v ?? '') as VisitFilters['audience_level'] })
            }
          />
          <MultiSelect
            label={t('schedule.tagsLabel')}
            placeholder={filters.tags?.length ? undefined : t('common.any')}
            clearable
            searchable
            data={tagOptions}
            value={filters.tags ?? []}
            onChange={(v) => update({ tags: v })}
            w={200}
          />
          <Switch
            label={t('schedule.mineOnly')}
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.currentTarget.checked)}
            pb={8}
          />
          {!mineOnly && hasSiblings && (
            <Switch
              label={t('visitList.includeSiblings')}
              checked={showSiblings}
              onChange={(e) => setShowSiblings(e.currentTarget.checked)}
              pb={8}
            />
          )}
        </Group>
      </FilterCard>

      {isError && <QueryError error={error} onRetry={() => refetch()} />}

      {/* Desktop: the full table. */}
      <Card withBorder p={0} visibleFrom="sm">
        <Table.ScrollContainer minWidth={760}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('schedule.colDate')}</Table.Th>
              <Table.Th>{t('schedule.colTime')}</Table.Th>
              <Table.Th>{t('schedule.colTitle')}</Table.Th>
              <Table.Th>{t('schedule.colVenue')}</Table.Th>
              <Table.Th>{t('schedule.colCommunicator')}</Table.Th>
              <Table.Th>{t('schedule.colAudience')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.items ?? []).map((it) => {
              const isLocal = it.source === 'local';
              return (
              <Table.Tr key={`${it.source}-${it.id ?? it.external_url}`}>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    {it.visit_date}
                    {isLocal &&
                      it.status &&
                      isOverdue({ status: it.status, visit_date: it.visit_date }) && (
                        <Badge variant="light" color="red" size="sm">
                          {t('schedule.overdue')}
                        </Badge>
                      )}
                    {!isLocal && (
                      <Badge variant="outline" color="grape" size="sm">
                        {it.source}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{it.start_time ? it.start_time.slice(0, 5) : '—'}</Table.Td>
                <Table.Td>
                  {isLocal ? (
                    <Anchor component={Link} to={`/visits/${it.id}`}>
                      {it.title}
                    </Anchor>
                  ) : (
                    <Anchor
                      href={it.external_url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {it.event_type ? enumLabel.eventType(it.event_type) : t('visitList.siblingActivity')}
                      <IconExternalLink size={14} style={{ marginLeft: 4, verticalAlign: 'text-bottom' }} />
                    </Anchor>
                  )}
                </Table.Td>
                <Table.Td>
                  {it.venue?.name}
                  {it.venue?.city ? `, ${it.venue.city}` : ''}
                </Table.Td>
                <Table.Td>{it.author?.name ?? '—'}</Table.Td>
                <Table.Td>
                  {it.audience_level ? (
                    <Badge variant="light">{enumLabel.audienceLevel(it.audience_level)}</Badge>
                  ) : (
                    '—'
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {isLocal && (it.author?.id === user?.id || user?.is_admin) && (
                    <Button
                      size="compact-sm"
                      variant="light"
                      onClick={() => navigate(`/visits/${it.id}/edit?status=completed`)}
                    >
                      {t('schedule.markDone')}
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
              );
            })}
            {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7} p={0}>
                  <EmptyState
                    icon={IconCalendarPlus}
                    title={t('schedule.emptyTitle')}
                    description={t('schedule.emptyDescription')}
                    actionLabel={t('schedule.scheduleEvent')}
                    onAction={() => navigate('/visits/new?status=planned')}
                  />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
        </Table.ScrollContainer>
      </Card>

      {/* Mobile: stacked cards instead of a sideways-scrolling table — same
          pattern as the events list. */}
      <Stack hiddenFrom="sm" gap="sm">
        {(data?.items ?? []).map((it) => {
          const isLocal = it.source === 'local';
          const canMarkDone = isLocal && (it.author?.id === user?.id || user?.is_admin);
          return (
            <div key={`m-${it.source}-${it.id ?? it.external_url}`}>
              <VisitCard
                item={it}
                onClick={isLocal && it.id != null ? () => navigate(`/visits/${it.id}`) : undefined}
              />
              {canMarkDone && (
                <Button
                  size="compact-sm"
                  variant="light"
                  fullWidth
                  mt={4}
                  onClick={() => navigate(`/visits/${it.id}/edit?status=completed`)}
                >
                  {t('schedule.markDone')}
                </Button>
              )}
            </div>
          );
        })}
        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <Card withBorder p={0}>
            <EmptyState
              icon={IconCalendarPlus}
              title={t('schedule.emptyTitle')}
              description={t('schedule.emptyDescription')}
              actionLabel={t('schedule.scheduleEvent')}
              onAction={() => navigate('/visits/new?status=planned')}
            />
          </Card>
        )}
      </Stack>
    </Stack>
  );
}
