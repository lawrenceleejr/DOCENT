import {
  Anchor,
  Button,
  Card,
  Grid,
  Group,
  MultiSelect,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Table,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import {
  IconCalendarStats,
  IconMapPin,
  IconStar,
  IconUserBolt,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import {
  AUDIENCE_LEVELS,
  EVENT_TYPES,
  VENUE_TYPES,
  type BreakdownRow,
  type LeaderboardRow,
  type StatsSummary,
  type TimeseriesPoint,
  type TopVenueRow,
} from '../api/types';
import { FilterCard } from '../components/FilterCard';
import { StatTile } from '../components/StatTile';
import { VIZ_DARK, VIZ_LIGHT } from '../components/vizTheme';
import { useEnumLabel } from '../i18n/enumLabels';
import { toDateString } from './VisitListPage';

const RANGES = [
  { labelKey: 'rangeLast3Years', captionKey: 'rangeCaptionLast3Years', value: '3y' },
  { labelKey: 'rangeLast5Years', captionKey: 'rangeCaptionLast5Years', value: '5y' },
  { labelKey: 'rangeAllTime', captionKey: 'rangeCaptionAllTime', value: 'all' },
] as const;
type RangeKey = (typeof RANGES)[number]['value'];

function rangeToDates(range: RangeKey): { date_from?: string; date_to?: string } {
  const now = new Date();
  const yearsBack = range === '3y' ? 3 : range === '5y' ? 5 : null;
  if (yearsBack !== null) {
    const from = new Date(now);
    from.setFullYear(now.getFullYear() - yearsBack);
    return { date_from: toDateString(from), date_to: toDateString(now) };
  }
  return {};
}

export interface TimeRow {
  t: number; // epoch ms of the half-year bucket start (for a real time axis)
  label: string; // e.g. "2026 H1"
  visits: number;
  people_reached: number;
}

const halfStart = (year: number, half: 1 | 2) => Date.UTC(year, half === 1 ? 0 : 6, 1);

/** Turn "YYYY H1"/"YYYY H2" rows into a gap-filled series on a real time axis:
 * every 6-month bucket between the first and last present period is included
 * (missing ones as zero), so spacing reflects actual elapsed time. */
export function buildTimeSeries(points: TimeseriesPoint[]): TimeRow[] {
  const parsed = points
    .map((p) => {
      const m = /^(\d{4})\sH([12])$/.exec(p.period);
      if (!m) return null;
      const year = Number(m[1]);
      const half = Number(m[2]) as 1 | 2;
      return { t: halfStart(year, half), year, half, visits: p.visits, people_reached: p.people_reached };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.t - b.t);
  if (parsed.length === 0) return [];

  const byT = new Map(parsed.map((d) => [d.t, d]));
  const end = parsed[parsed.length - 1];
  const out: TimeRow[] = [];
  let year = parsed[0].year;
  let half = parsed[0].half as 1 | 2;
  for (;;) {
    const t = halfStart(year, half);
    const hit = byT.get(t);
    out.push({
      t,
      label: `${year} H${half}`,
      visits: hit?.visits ?? 0,
      people_reached: hit?.people_reached ?? 0,
    });
    if (year === end.year && half === end.half) break;
    [year, half] = half === 1 ? [year, 2] : [year + 1, 1];
  }
  return out;
}

const tooltipStyle = (viz: typeof VIZ_LIGHT) => ({
  backgroundColor: viz.tooltipBg,
  border: `1px solid ${viz.tooltipBorder}`,
  borderRadius: 6,
  color: viz.tooltipInk,
  fontSize: 13,
});

function TimePanel({
  title,
  data,
  ticks,
  dataKey,
  color,
  viz,
}: {
  title: string;
  data: TimeRow[];
  ticks: number[];
  dataKey: 'visits' | 'people_reached';
  color: string;
  viz: typeof VIZ_LIGHT;
}) {
  const labelFor = (t: number) => data.find((d) => d.t === t)?.label ?? '';
  return (
    <Card withBorder p="md">
      <Text fw={600} mb="xs">
        {title}
      </Text>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={viz.grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={ticks}
            tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
            stroke={viz.axis}
            tick={{ fill: viz.mutedInk, fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            stroke={viz.axis}
            tick={{ fill: viz.mutedInk, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={tooltipStyle(viz)}
            labelFormatter={(t: number) => labelFor(t)}
            formatter={(value: number) => [value.toLocaleString(), title]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: viz.tooltipBg, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function BreakdownPanel({
  title,
  data,
  by,
  color,
  viz,
}: {
  title: string;
  data: BreakdownRow[];
  by: 'venueType' | 'audienceLevel' | 'hostRelationship';
  color: string;
  viz: typeof VIZ_LIGHT;
}) {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const rows = data.map((row) => ({ ...row, label: enumLabel[by](row.key) }));
  const height = rows.length <= 1 ? 96 : Math.max(140, rows.length * 38 + 24);
  return (
    <Card withBorder p="md">
      <Text fw={600} mb="xs">
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text c="dimmed" size="sm" py="xl" ta="center">
          {t('dashboard.noDataInRange')}
        </Text>
      ) : (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={viz.grid} horizontal={false} />
          <XAxis
            type="number"
            stroke={viz.axis}
            tick={{ fill: viz.mutedInk, fontSize: 12 }}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            stroke={viz.axis}
            tick={{ fill: viz.mutedInk, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={tooltipStyle(viz)}
            formatter={(value: number, name: string) => [
              value.toLocaleString(),
              name === 'visits' ? t('dashboard.statVisits') : t('dashboard.statPeopleReached'),
            ]}
          />
          <Bar dataKey="visits" fill={color} barSize={16} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const scheme = useComputedColorScheme('dark');
  const viz = scheme === 'dark' ? VIZ_DARK : VIZ_LIGHT;
  const [range, setRange] = useState<RangeKey>('5y');
  const dates = useMemo(() => rangeToDates(range), [range]);

  // Dashboard-wide filters, applied to every stat below.
  const [venueType, setVenueType] = useState<string | null>(null);
  const [eventType, setEventType] = useState<string | null>(null);
  const [audience, setAudience] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [includeSiblings, setIncludeSiblings] = useState(true);

  const { data: tagOptions = [] } = useQuery({
    queryKey: ['visits', 'tags'],
    queryFn: () => api.get<string[]>('/api/visits/tags'),
  });

  const filters = useMemo(
    () => ({
      ...dates,
      venue_type: venueType ?? undefined,
      event_type: eventType ?? undefined,
      audience_level: audience ?? undefined,
      tags: tags.length ? tags.join(',') : undefined,
    }),
    [dates, venueType, eventType, audience, tags],
  );
  const activeFilterCount =
    [venueType, eventType, audience].filter(Boolean).length +
    (tags.length > 0 ? 1 : 0) +
    (includeSiblings ? 0 : 1);
  const hasFilters = activeFilterCount > 0;
  const clearFilters = () => {
    setVenueType(null);
    setEventType(null);
    setAudience(null);
    setTags([]);
  };

  const { data: summary } = useQuery({
    queryKey: ['stats', 'summary', filters, includeSiblings],
    queryFn: () =>
      api.get<StatsSummary>('/api/stats/summary', {
        ...filters,
        include_federated: includeSiblings,
      }),
  });
  const { data: timeseries } = useQuery({
    queryKey: ['stats', 'timeseries', filters, includeSiblings],
    queryFn: () =>
      api.get<TimeseriesPoint[]>('/api/stats/timeseries', {
        ...filters,
        include_federated: includeSiblings,
      }),
  });
  const { data: byVenueType } = useQuery({
    queryKey: ['stats', 'breakdown', 'venue_type', filters, includeSiblings],
    queryFn: () =>
      api.get<BreakdownRow[]>('/api/stats/breakdown', {
        by: 'venue_type',
        ...filters,
        include_federated: includeSiblings,
      }),
  });
  const { data: byAudience } = useQuery({
    queryKey: ['stats', 'breakdown', 'audience_level', filters, includeSiblings],
    queryFn: () =>
      api.get<BreakdownRow[]>('/api/stats/breakdown', {
        by: 'audience_level',
        ...filters,
        include_federated: includeSiblings,
      }),
  });
  const { data: byRelationship } = useQuery({
    // host_relationship stays local-only — the federation feed carries no
    // host-relationship data.
    queryKey: ['stats', 'breakdown', 'host_relationship', filters],
    queryFn: () =>
      api.get<BreakdownRow[]>('/api/stats/breakdown', {
        by: 'host_relationship',
        ...filters,
        include_federated: false,
      }),
  });
  const { data: topVenues } = useQuery({
    queryKey: ['stats', 'top-venues', filters],
    queryFn: () => api.get<TopVenueRow[]>('/api/stats/top-venues', { limit: 10, ...filters }),
  });
  const { data: leaderboard } = useQuery({
    queryKey: ['stats', 'leaderboard', filters],
    queryFn: () => api.get<LeaderboardRow[]>('/api/stats/leaderboard', { limit: 20, ...filters }),
  });

  const series = useMemo(() => buildTimeSeries(timeseries ?? []), [timeseries]);
  // One tick per calendar year (Jan 1) that falls within the data range.
  const yearTicks = useMemo(() => {
    if (series.length === 0) return [];
    const years = new Set(series.map((d) => new Date(d.t).getUTCFullYear()));
    return [...years].map((y) => Date.UTC(y, 0, 1)).filter(
      (t) => t >= series[0].t && t <= series[series.length - 1].t,
    );
  }, [series]);

  const activeRange = RANGES.find((r) => r.value === range);
  const rangeCaption = activeRange ? t(`dashboard.${activeRange.captionKey}`) : '';
  const avgPerVisit =
    summary && summary.total_visits > 0
      ? Math.round(summary.total_people_reached / summary.total_visits)
      : null;

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>{t('dashboard.title')}</Title>
          <Text c="dimmed" size="sm">
            {t('dashboard.subtitle')}
          </Text>
        </div>
        <SegmentedControl
          value={range}
          onChange={(value) => setRange(value as RangeKey)}
          data={RANGES.map((r) => ({ label: t(`dashboard.${r.labelKey}`), value: r.value }))}
        />
      </Group>

      <FilterCard activeCount={activeFilterCount}>
        <Group align="flex-end">
          <Select
            label={t('dashboard.venueTypeLabel')}
            placeholder={t('common.all')}
            clearable
            data={VENUE_TYPES.map((v) => ({ value: v, label: enumLabel.venueType(v) }))}
            value={venueType}
            onChange={setVenueType}
            w={180}
          />
          <Select
            label={t('dashboard.eventTypeLabel')}
            placeholder={t('common.all')}
            clearable
            data={EVENT_TYPES.map((v) => ({ value: v, label: enumLabel.eventType(v) }))}
            value={eventType}
            onChange={setEventType}
            w={180}
          />
          <Select
            label={t('dashboard.audienceLabel')}
            placeholder={t('common.all')}
            clearable
            data={AUDIENCE_LEVELS.map((v) => ({ value: v, label: enumLabel.audienceLevel(v) }))}
            value={audience}
            onChange={setAudience}
            w={180}
          />
          <MultiSelect
            label={t('dashboard.tagsLabel')}
            placeholder={tags.length ? undefined : t('common.any')}
            clearable
            searchable
            data={tagOptions}
            value={tags}
            onChange={setTags}
            w={220}
          />
          <Switch
            label={t('dashboard.includeSiblings')}
            checked={includeSiblings}
            onChange={(event) => setIncludeSiblings(event.currentTarget.checked)}
            mb={6}
          />
          {hasFilters && (
            <Button variant="subtle" onClick={clearFilters}>
              {t('dashboard.clearFilters')}
            </Button>
          )}
        </Group>
      </FilterCard>

      {includeSiblings && (
        <Text size="xs" c="dimmed">
          {t('dashboard.federatedCaveat')}
        </Text>
      )}

      <SimpleGrid cols={{ base: 1, xs: 2, md: 5 }}>
        <StatTile
          label={t('dashboard.statVisits')}
          value={summary?.total_visits.toLocaleString() ?? '—'}
          icon={IconCalendarStats}
          color="brand"
          sub={rangeCaption}
        />
        <StatTile
          label={t('dashboard.statPeopleReached')}
          value={summary?.total_people_reached.toLocaleString() ?? '—'}
          icon={IconUsers}
          color="grape"
          sub={
            avgPerVisit != null
              ? t('dashboard.avgPerVisit', { formattedCount: avgPerVisit.toLocaleString() })
              : undefined
          }
        />
        <StatTile
          label={t('dashboard.statVenuesVisited')}
          value={summary?.distinct_venues ?? '—'}
          icon={IconMapPin}
          color="teal"
          sub={t('dashboard.distinctLocations')}
        />
        <StatTile
          label={t('dashboard.statActiveCommunicators')}
          value={summary?.active_communicators ?? '—'}
          icon={IconUserBolt}
          color="indigo"
          sub={t('dashboard.contributing')}
        />
        <StatTile
          label={t('dashboard.statAvgRating')}
          value={summary?.avg_rating != null ? `${summary.avg_rating}` : '—'}
          icon={IconStar}
          color="yellow"
          sub={t('dashboard.outOfFive')}
        />
      </SimpleGrid>

      <Title order={3} mt="sm">
        {t('dashboard.overTimeHeading')}
      </Title>
      {/* Two measures, two panels — never a dual-axis chart. */}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <TimePanel
          title={t('dashboard.visitsPer6Months')}
          data={series}
          ticks={yearTicks}
          dataKey="visits"
          color={viz.series1}
          viz={viz}
        />
        <TimePanel
          title={t('dashboard.peopleReachedPer6Months')}
          data={series}
          ticks={yearTicks}
          dataKey="people_reached"
          color={viz.series2}
          viz={viz}
        />
      </SimpleGrid>

      <Title order={3} mt="sm">
        {t('dashboard.breakdownsHeading')}
      </Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <BreakdownPanel
          title={t('dashboard.visitsByVenueType')}
          data={byVenueType ?? []}
          by="venueType"
          color={viz.series1}
          viz={viz}
        />
        <BreakdownPanel
          title={t('dashboard.visitsByAudienceLevel')}
          data={byAudience ?? []}
          by="audienceLevel"
          color={viz.series1}
          viz={viz}
        />
        <BreakdownPanel
          title={t('dashboard.visitsByHostRelationship')}
          data={byRelationship ?? []}
          by="hostRelationship"
          color={viz.series2}
          viz={viz}
        />
      </SimpleGrid>

      <Title order={3} mt="sm">
        {t('dashboard.leadersHeading')}
      </Title>
      <Text c="dimmed" size="xs">
        {t('dashboard.localOnlyNote')}
      </Text>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder p="md">
            <Text fw={600} mb="xs">
              {t('dashboard.topVenues')}
            </Text>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('dashboard.colVenue')}</Table.Th>
                  <Table.Th ta="right">{t('dashboard.statVisits')}</Table.Th>
                  <Table.Th ta="right">{t('dashboard.statPeopleReached')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(topVenues ?? []).map((row) => (
                  <Table.Tr key={row.venue.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/venues/${row.venue.id}`} size="sm">
                        {row.venue.name}
                      </Anchor>
                      {row.venue.city && (
                        <Text span c="dimmed" size="sm">
                          {' '}
                          — {row.venue.city}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {row.visits.toLocaleString()}
                    </Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {row.people_reached.toLocaleString()}
                    </Table.Td>
                  </Table.Tr>
                ))}
                {(topVenues?.length ?? 0) === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={3}>
                      <Text c="dimmed" ta="center" py="sm">
                        {t('dashboard.noDataShort')}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder p="md">
            <Text fw={600} mb="xs">
              {t('dashboard.communicatorLeaderboard')}
            </Text>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('dashboard.colCommunicator')}</Table.Th>
                  <Table.Th ta="right">{t('dashboard.statVisits')}</Table.Th>
                  <Table.Th ta="right">{t('dashboard.statPeopleReached')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(leaderboard ?? []).map((row) => (
                  <Table.Tr key={row.user.id}>
                    <Table.Td>{row.user.name}</Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {row.visits.toLocaleString()}
                    </Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {row.people_reached.toLocaleString()}
                    </Table.Td>
                  </Table.Tr>
                ))}
                {(leaderboard?.length ?? 0) === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={3}>
                      <Text c="dimmed" ta="center" py="sm">
                        {t('dashboard.noDataShort')}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
