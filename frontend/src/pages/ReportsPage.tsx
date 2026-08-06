import {
  Badge,
  Button,
  Card,
  Group,
  MultiSelect,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconFileTypeCsv,
  IconFileTypePdf,
  IconJson,
  IconMarkdown,
  IconMath,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, buildQuery } from '../api/client';
import {
  AUDIENCE_LEVELS,
  EVENT_TYPES,
  VENUE_TYPES,
  type ActivityReport,
  type ReportScope,
  type ReportStatusFilter,
} from '../api/types';
import { FilterCard } from '../components/FilterCard';
import { usePageTitle } from '../components/usePageTitle';
import { QueryError } from '../components/QueryError';
import { StatTile } from '../components/StatTile';
import { useEnumLabel } from '../i18n/enumLabels';
import { IconBroadcast, IconCalendarStats, IconMapPin, IconUsers } from '@tabler/icons-react';
import { toDateString } from './VisitListPage';

const PREVIEW_LIMIT = 50;

type MiniRow = { label: string; visits: number; people_reached: number };

/** A compact breakdown table for the on-page report preview — mirrors a section
 * of the downloadable report so the preview shows the same analysis. */
function MiniTable({
  title,
  rows,
  visitsLabel,
  peopleLabel,
}: {
  title: string;
  rows: MiniRow[];
  visitsLabel: string;
  peopleLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card withBorder p="md">
      <Text fw={600} mb="xs">
        {title}
      </Text>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th ta="right">{visitsLabel}</Table.Th>
            <Table.Th ta="right">{peopleLabel}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={i}>
              <Table.Td>{r.label}</Table.Td>
              <Table.Td ta="right" className="tabular-nums">
                {r.visits.toLocaleString()}
              </Table.Td>
              <Table.Td ta="right" className="tabular-nums">
                {r.people_reached.toLocaleString()}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

export function ReportsPage() {
  const { t } = useTranslation();
  usePageTitle(t('reports.title'));
  const enumLabel = useEnumLabel();
  const [scope, setScope] = useState<ReportScope>('all');
  const [status, setStatus] = useState<ReportStatusFilter>('completed');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [venueType, setVenueType] = useState<string | null>(null);
  const [eventType, setEventType] = useState<string | null>(null);
  const [audience, setAudience] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  const { data: tagOptions = [] } = useQuery({
    queryKey: ['visits', 'tags'],
    queryFn: () => api.get<string[]>('/api/visits/tags'),
  });

  const filterParams = {
    scope,
    status,
    date_from: dateFrom ? toDateString(dateFrom) : undefined,
    date_to: dateTo ? toDateString(dateTo) : undefined,
    venue_type: venueType ?? undefined,
    event_type: eventType ?? undefined,
    audience_level: audience ?? undefined,
    tags: tags.length ? tags.join(',') : undefined,
  };

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['report', filterParams],
    queryFn: () =>
      api.get<ActivityReport>('/api/reports/activities', { format: 'json', ...filterParams }),
  });

  const downloadHref = (format: 'json' | 'csv' | 'md' | 'pdf' | 'latex') =>
    `/api/reports/activities${buildQuery({ format, ...filterParams })}`;

  const activeFilterCount =
    [dateFrom, dateTo, venueType, eventType, audience].filter(Boolean).length +
    (tags.length > 0 ? 1 : 0);

  const rows = data?.rows ?? [];
  const shown = rows.slice(0, PREVIEW_LIMIT);

  const FORMATS = [
    { fmt: 'pdf' as const, label: t('reports.formatPdf'), icon: IconFileTypePdf },
    { fmt: 'csv' as const, label: t('reports.formatCsv'), icon: IconFileTypeCsv },
    { fmt: 'md' as const, label: t('reports.formatMarkdown'), icon: IconMarkdown },
    { fmt: 'latex' as const, label: t('reports.formatLatex'), icon: IconMath },
    { fmt: 'json' as const, label: t('reports.formatJson'), icon: IconJson },
  ];

  return (
    <Stack>
      <div>
        <Title order={2}>{t('reports.title')}</Title>
        <Text c="dimmed" size="sm">
          {t('reports.subtitlePrefix')} <strong>{t('reports.subtitleBroadImpact')}</strong>{' '}
          {t('reports.subtitleSuffix')}
        </Text>
      </div>

      <FilterCard activeCount={activeFilterCount}>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <div>
              <Text size="sm" fw={500} mb={4}>
                {t('reports.wholeActivitiesLabel')}
              </Text>
              <SegmentedControl
                fullWidth
                value={scope}
                onChange={(v) => setScope(v as ReportScope)}
                data={[
                  { label: t('reports.myActivities'), value: 'mine' },
                  { label: t('reports.everyone'), value: 'all' },
                ]}
              />
            </div>
            <div>
              <Text size="sm" fw={500} mb={4}>
                {t('reports.statusLabel')}
              </Text>
              <SegmentedControl
                fullWidth
                value={status}
                onChange={(v) => setStatus(v as ReportStatusFilter)}
                data={[
                  { label: enumLabel.visitStatus('completed'), value: 'completed' },
                  { label: enumLabel.visitStatus('planned'), value: 'planned' },
                  { label: t('common.all'), value: 'all' },
                ]}
              />
            </div>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <DateInput
              label={t('reports.fromLabel')}
              placeholder={t('reports.fromPlaceholder')}
              clearable
              valueFormat="YYYY-MM-DD"
              value={dateFrom}
              onChange={setDateFrom}
            />
            <DateInput
              label={t('reports.toLabel')}
              placeholder={t('reports.toPlaceholder')}
              clearable
              valueFormat="YYYY-MM-DD"
              value={dateTo}
              onChange={setDateTo}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Select
              label={t('reports.venueTypeLabel')}
              placeholder={t('common.all')}
              clearable
              data={VENUE_TYPES.map((v) => ({ value: v, label: enumLabel.venueType(v) }))}
              value={venueType}
              onChange={setVenueType}
            />
            <Select
              label={t('reports.eventTypeLabel')}
              placeholder={t('common.all')}
              clearable
              data={EVENT_TYPES.map((v) => ({ value: v, label: enumLabel.eventType(v) }))}
              value={eventType}
              onChange={setEventType}
            />
            <Select
              label={t('reports.audienceLabel')}
              placeholder={t('common.all')}
              clearable
              data={AUDIENCE_LEVELS.map((v) => ({ value: v, label: enumLabel.audienceLevel(v) }))}
              value={audience}
              onChange={setAudience}
            />
          </SimpleGrid>

          <MultiSelect
            label={t('reports.tagsLabel')}
            placeholder={tags.length ? undefined : t('reports.tagsPlaceholder')}
            clearable
            searchable
            data={tagOptions}
            value={tags}
            onChange={setTags}
          />
        </Stack>
      </FilterCard>

      <Card withBorder p="lg">
        <Text size="sm" fw={500} mb={6}>
          {t('reports.downloadLabel')}
        </Text>
        <Group>
          {FORMATS.map(({ fmt, label, icon: Icon }) => (
            <Button
              key={fmt}
              component="a"
              href={downloadHref(fmt)}
              variant={fmt === 'pdf' ? 'gradient' : 'default'}
              leftSection={<Icon size={18} />}
              disabled={rows.length === 0}
            >
              {label}
            </Button>
          ))}
        </Group>
      </Card>

      {isError && <QueryError error={error} onRetry={() => refetch()} />}

      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <StatTile
          label={t('reports.statActivities')}
          value={data?.summary.total_activities.toLocaleString() ?? '—'}
          icon={IconCalendarStats}
          color="brand"
        />
        <StatTile
          label={t('reports.statPeopleInPerson')}
          value={
            data
              ? Math.max(
                  0,
                  data.summary.total_people_reached - data.summary.total_people_reached_remote,
                ).toLocaleString()
              : '—'
          }
          icon={IconUsers}
          color="grape"
        />
        <StatTile
          label={t('reports.statPeopleRemote')}
          value={data?.summary.total_people_reached_remote.toLocaleString() ?? '—'}
          icon={IconBroadcast}
          color="cyan"
        />
        <StatTile
          label={t('reports.statDistinctVenues')}
          value={data?.summary.distinct_venues ?? '—'}
          icon={IconMapPin}
          color="teal"
        />
      </SimpleGrid>

      {data?.analysis && rows.length > 0 && (
        <Stack gap="sm">
          <Title order={4}>{t('dashboard.breakdownsHeading')}</Title>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <MiniTable
              title={t('dashboard.visitsByVenueType')}
              rows={data.analysis.by_venue_type}
              visitsLabel={t('dashboard.statVisits')}
              peopleLabel={t('dashboard.statPeopleReached')}
            />
            <MiniTable
              title={t('dashboard.visitsByAudienceLevel')}
              rows={data.analysis.by_audience_level}
              visitsLabel={t('dashboard.statVisits')}
              peopleLabel={t('dashboard.statPeopleReached')}
            />
            <MiniTable
              title={t('dashboard.visitsByHostRelationship')}
              rows={data.analysis.by_host_relationship}
              visitsLabel={t('dashboard.statVisits')}
              peopleLabel={t('dashboard.statPeopleReached')}
            />
            <MiniTable
              title={t('dashboard.topVenues')}
              rows={data.analysis.top_venues.map((v) => ({
                label: v.city ? `${v.venue}, ${v.city}` : v.venue,
                visits: v.visits,
                people_reached: v.people_reached,
              }))}
              visitsLabel={t('dashboard.statVisits')}
              peopleLabel={t('dashboard.statPeopleReached')}
            />
            {data.analysis.leaderboard.length > 1 && (
              <MiniTable
                title={t('dashboard.communicatorLeaderboard')}
                rows={data.analysis.leaderboard.map((l) => ({
                  label: l.name,
                  visits: l.visits,
                  people_reached: l.people_reached,
                }))}
                visitsLabel={t('dashboard.statVisits')}
                peopleLabel={t('dashboard.statPeopleReached')}
              />
            )}
          </SimpleGrid>
        </Stack>
      )}

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={720}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('reports.colDate')}</Table.Th>
                <Table.Th>{t('reports.colActivity')}</Table.Th>
                <Table.Th>{t('reports.colEvent')}</Table.Th>
                <Table.Th>{t('reports.colVenue')}</Table.Th>
                <Table.Th>{t('reports.colAudience')}</Table.Th>
                <Table.Th ta="right">{t('reports.colPeople')}</Table.Th>
                <Table.Th>{t('reports.colPresenter')}</Table.Th>
                <Table.Th>{t('reports.colCoverage')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((r, i) => (
                <Table.Tr key={i}>
                  <Table.Td className="tabular-nums">{r.date}</Table.Td>
                  <Table.Td>{r.title}</Table.Td>
                  <Table.Td>{enumLabel.eventType(r.event_type_raw)}</Table.Td>
                  <Table.Td>
                    {r.venue}
                    {r.city ? `, ${r.city}` : ''}
                  </Table.Td>
                  <Table.Td>{enumLabel.audienceLevel(r.audience_raw)}</Table.Td>
                  <Table.Td ta="right" className="tabular-nums">
                    {r.people_reached.toLocaleString()}
                  </Table.Td>
                  <Table.Td>{r.presenter}</Table.Td>
                  <Table.Td>
                    {r.coverage_categories.length > 0 ? (
                      <Group gap={4}>
                        {r.coverage_categories.map((c) => (
                          <Badge key={c} size="xs" variant="light" color="blue">
                            {enumLabel.coverageCategory(c)}
                          </Badge>
                        ))}
                      </Group>
                    ) : (
                      <Text c="dimmed" size="sm">
                        —
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
              {!isFetching && rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text c="dimmed" ta="center" py="xl">
                      {t('reports.emptyState', {
                        everyone: t('reports.everyone'),
                        myActivities: t('reports.myActivities'),
                        all: t('common.all'),
                      })}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {rows.length > PREVIEW_LIMIT && (
        <Text size="sm" c="dimmed" ta="center">
          {t('reports.showingFirst', {
            limit: PREVIEW_LIMIT,
            total: rows.length.toLocaleString(),
          })}
        </Text>
      )}
    </Stack>
  );
}
