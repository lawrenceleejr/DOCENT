import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconCalendarPlus, IconExternalLink } from '@tabler/icons-react';
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
  type Paginated,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { FilterCard } from '../components/FilterCard';
import { filterParams, type VisitFilters } from '../components/filters';
import { useEnumLabel } from '../i18n/enumLabels';
import { toDateString } from './VisitListPage';

export function SchedulePage() {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<VisitFilters>({});
  const [mineOnly, setMineOnly] = useState(false);
  const [showSiblings, setShowSiblings] = useState(true);

  const update = (patch: Partial<VisitFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const params = {
    ...filterParams(filters),
    status: 'planned',
    author_id: mineOnly ? user?.id : undefined,
    // Siblings that opt into publishing planned events appear here too; the
    // mine-only scope keeps them out (the feed can't satisfy an author filter).
    include_federated: showSiblings && !mineOnly,
    sort: 'visit_date', // soonest first
    page_size: 100,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['visits', 'schedule', params],
    queryFn: () => api.get<Paginated<ActivityListItem>>('/api/visits', params),
    enabled: !!user,
  });

  const { data: tagOptions = [] } = useQuery({
    queryKey: ['visits', 'tags'],
    queryFn: () => api.get<string[]>('/api/visits/tags'),
  });

  // The .ics export mirrors what's on screen (scope + filters).
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
          <Button component="a" href={icsHref} variant="default">
            {t('schedule.addToCalendar')}
          </Button>
          <Button variant="gradient" onClick={() => navigate('/visits/new?status=planned')}>
            {t('schedule.scheduleEvent')}
          </Button>
        </Group>
      </Group>

      <FilterCard activeCount={activeFilterCount}>
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
          {!mineOnly && (
            <Switch
              label={t('visitList.includeSiblings')}
              checked={showSiblings}
              onChange={(e) => setShowSiblings(e.currentTarget.checked)}
              pb={8}
            />
          )}
        </Group>
      </FilterCard>

      <Card withBorder p={0}>
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
                      onClick={() => navigate(`/visits/${it.id}/edit`)}
                    >
                      {t('schedule.markDone')}
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
              );
            })}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
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
    </Stack>
  );
}
