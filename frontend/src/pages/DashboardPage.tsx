import {
  Anchor,
  Button,
  Card,
  Grid,
  Group,
  MultiSelect,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Table,
  Title,
  Tooltip as HelpTooltip,
  useComputedColorScheme,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
  IconBroadcast,
  IconCalendarStats,
  IconInfoCircle,
  IconMapPin,
  IconSearch,
  IconUserBolt,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  type AuthConfig,
  type BreakdownRow,
  type LeaderboardRow,
  type StatsSummary,
  type TimeseriesPoint,
  type TopVenueRow,
} from '../api/types';
import { EmptyState } from '../components/EmptyState';
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
  t: number; // epoch ms of the bucket start (for a real time axis)
  label: string; // e.g. "2026-03", "2026 Q1", or "2026 H1"
  visits: number;
  people_reached: number;
  people_reached_remote: number;
  people_reached_in_person: number;
  planned_visits: number;
}

type Gran = 'month' | 'quarter' | 'half';
const STEP_MONTHS: Record<Gran, number> = { month: 1, quarter: 3, half: 6 };

/** Parse a bucket label the backend produced into its start-of-bucket epoch. The
 * backend now picks the granularity dynamically (#27), so accept all three. */
function parsePeriod(period: string): { t: number; gran: Gran } | null {
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})$/.exec(period))) {
    return { t: Date.UTC(Number(m[1]), Number(m[2]) - 1, 1), gran: 'month' };
  }
  if ((m = /^(\d{4})\sQ([1-4])$/.exec(period))) {
    return { t: Date.UTC(Number(m[1]), (Number(m[2]) - 1) * 3, 1), gran: 'quarter' };
  }
  if ((m = /^(\d{4})\sH([12])$/.exec(period))) {
    return { t: Date.UTC(Number(m[1]), (Number(m[2]) - 1) * 6, 1), gran: 'half' };
  }
  return null;
}

function labelForDate(t: number, gran: Gran): string {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  if (gran === 'month') return `${y}-${String(mo + 1).padStart(2, '0')}`;
  if (gran === 'quarter') return `${y} Q${Math.floor(mo / 3) + 1}`;
  // Spell out the half-year rather than the cryptic "H1"/"H2" (#51).
  return mo < 6 ? `Jan–Jun ${y}` : `Jul–Dec ${y}`;
}

/** Turn the backend's period rows into a gap-filled series on a real time axis:
 * every bucket between the first and last present period is included (missing
 * ones as zero) at the detected granularity, so spacing reflects elapsed time. */
export function buildTimeSeries(points: TimeseriesPoint[]): TimeRow[] {
  const parsed = points
    .map((p) => {
      const pr = parsePeriod(p.period);
      if (!pr) return null;
      return {
        t: pr.t,
        gran: pr.gran,
        visits: p.visits,
        people_reached: p.people_reached,
        people_reached_remote: p.people_reached_remote ?? 0,
        planned_visits: p.planned_visits ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.t - b.t);
  if (parsed.length === 0) return [];

  const gran = parsed[0].gran;
  const step = STEP_MONTHS[gran];
  const byT = new Map(parsed.map((d) => [d.t, d]));
  const endT = parsed[parsed.length - 1].t;
  const out: TimeRow[] = [];
  const cur = new Date(parsed[0].t);
  for (;;) {
    const t = cur.getTime();
    const hit = byT.get(t);
    out.push({
      t,
      label: labelForDate(t, gran),
      visits: hit?.visits ?? 0,
      people_reached: hit?.people_reached ?? 0,
      people_reached_remote: hit?.people_reached_remote ?? 0,
      people_reached_in_person: (hit?.people_reached ?? 0) - (hit?.people_reached_remote ?? 0),
      planned_visits: hit?.planned_visits ?? 0,
    });
    if (t >= endT) break;
    cur.setUTCMonth(cur.getUTCMonth() + step);
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
  lines,
  color,
  viz,
  caption,
}: {
  title: string;
  data: TimeRow[];
  ticks: number[];
  // One or more series. A line uses `color` unless it sets its own; `dashed`
  // renders it as a dashed segment (the future/scheduled tail — #28). When a
  // line sets `name`, a legend is shown and the tooltip labels each series (the
  // in-person vs remote split — #38). A line on `axis: 'right'` draws a second
  // y-axis so a huge broadcast scale doesn't flatten the in-person line (#38).
  lines: { key: string; dashed?: boolean; color?: string; name?: string; axis?: 'left' | 'right' }[];
  color: string;
  viz: typeof VIZ_LIGHT;
  caption?: string;
}) {
  const labelFor = (t: number) => data.find((d) => d.t === t)?.label ?? '';
  const rightLine = lines.find((ln) => ln.axis === 'right');
  const hasRight = !!rightLine;
  const leftColor = (lines.find((ln) => (ln.axis ?? 'left') === 'left')?.color ?? color) as string;
  const rightColor = (rightLine?.color ?? color) as string;
  const compact = (n: number) =>
    new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return (
    <Card withBorder p="md">
      <Group justify="space-between" gap="xs" wrap="nowrap" mb="xs">
        <Text fw={600}>{title}</Text>
        {caption && (
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {caption}
          </Text>
        )}
      </Group>
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
            tick={{ fill: viz.mutedInk, fontSize: 11 }}
            tickLine={false}
            minTickGap={8}
          />
          <YAxis
            yAxisId="left"
            stroke={viz.axis}
            tick={{ fill: hasRight ? leftColor : viz.mutedInk, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
            tickFormatter={hasRight ? compact : undefined}
          />
          {hasRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke={viz.axis}
              tick={{ fill: rightColor, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={48}
              allowDecimals={false}
              tickFormatter={compact}
            />
          )}
          <Tooltip
            contentStyle={tooltipStyle(viz)}
            labelFormatter={(t: number) => labelFor(t)}
            formatter={(value: number, name: string) => [
              Number(value).toLocaleString(),
              name && name !== title ? name : title,
            ]}
          />
          {lines.some((ln) => ln.name) && (
            <Legend wrapperStyle={{ fontSize: 12, color: viz.mutedInk }} />
          )}
          {lines.map((ln) => (
            <Line
              key={ln.key}
              yAxisId={ln.axis ?? 'left'}
              type="monotone"
              dataKey={ln.key}
              name={ln.name}
              stroke={ln.color ?? color}
              strokeWidth={2}
              strokeDasharray={ln.dashed ? '5 4' : undefined}
              strokeOpacity={ln.dashed ? 0.75 : 1}
              dot={ln.dashed ? false : { r: 3, fill: ln.color ?? color, strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: viz.tooltipBg, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
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
  const navigate = useNavigate();
  const enumLabel = useEnumLabel();
  const scheme = useComputedColorScheme('dark');
  const viz = scheme === 'dark' ? VIZ_DARK : VIZ_LIGHT;
  const [range, setRange] = useState<RangeKey>('all');
  const dates = useMemo(() => rangeToDates(range), [range]);

  // Dashboard-wide filters, applied to every stat below.
  // Each category filter takes several values at once now (#13).
  const [venueTypes, setVenueTypes] = useState<string[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  // Free-text people search (communicator / host / additional presenters),
  // debounced so a keystroke doesn't refire every stat query (#13).
  const [peopleQuery, setPeopleQuery] = useState('');
  const [debouncedPeople] = useDebouncedValue(peopleQuery, 300);
  const [includeSiblings, setIncludeSiblings] = useState(true);

  // Federation controls only make sense when this instance pulls from peers;
  // hide them otherwise so the analysis page stays uncluttered (#6).
  const { data: config } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/api/auth/config'),
    staleTime: 5 * 60 * 1000,
  });
  const hasSiblings = !!config?.has_siblings;
  const includeFederated = includeSiblings && hasSiblings;

  const { data: tagOptions = [] } = useQuery({
    queryKey: ['visits', 'tags'],
    queryFn: () => api.get<string[]>('/api/visits/tags'),
  });

  const filters = useMemo(
    () => ({
      ...dates,
      // The API client stringifies these to comma-separated values, which the
      // stats endpoints parse back into multi-value filters (#13).
      venue_type: venueTypes.length ? venueTypes.join(',') : undefined,
      event_type: eventTypes.length ? eventTypes.join(',') : undefined,
      audience_level: audiences.length ? audiences.join(',') : undefined,
      tags: tags.length ? tags.join(',') : undefined,
      q: debouncedPeople.trim() || undefined,
    }),
    [dates, venueTypes, eventTypes, audiences, tags, debouncedPeople],
  );
  const activeFilterCount =
    (venueTypes.length ? 1 : 0) +
    (eventTypes.length ? 1 : 0) +
    (audiences.length ? 1 : 0) +
    (tags.length > 0 ? 1 : 0) +
    (debouncedPeople.trim() ? 1 : 0) +
    (hasSiblings && !includeSiblings ? 1 : 0);
  const hasFilters = activeFilterCount > 0;
  const clearFilters = () => {
    setVenueTypes([]);
    setEventTypes([]);
    setAudiences([]);
    setTags([]);
    setPeopleQuery('');
  };

  const { data: summary } = useQuery({
    queryKey: ['stats', 'summary', filters, includeFederated],
    queryFn: () =>
      api.get<StatsSummary>('/api/stats/summary', {
        ...filters,
        include_federated: includeFederated,
      }),
  });
  const { data: timeseries } = useQuery({
    queryKey: ['stats', 'timeseries', filters, includeFederated],
    queryFn: () =>
      api.get<TimeseriesPoint[]>('/api/stats/timeseries', {
        ...filters,
        include_federated: includeFederated,
      }),
  });
  const { data: byVenueType } = useQuery({
    queryKey: ['stats', 'breakdown', 'venue_type', filters, includeFederated],
    queryFn: () =>
      api.get<BreakdownRow[]>('/api/stats/breakdown', {
        by: 'venue_type',
        ...filters,
        include_federated: includeFederated,
      }),
  });
  const { data: byAudience } = useQuery({
    queryKey: ['stats', 'breakdown', 'audience_level', filters, includeFederated],
    queryFn: () =>
      api.get<BreakdownRow[]>('/api/stats/breakdown', {
        by: 'audience_level',
        ...filters,
        include_federated: includeFederated,
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

  // Split the visits series: solid through the current period (recorded
  // visits), dashed for what's still scheduled (#28). The current bucket gets
  // BOTH — its solid point is what's recorded so far, and the dashed line
  // shows its projected total (recorded + still scheduled), so an upcoming
  // event later in this same half-year is visible instead of silently absent.
  // The dashed segment is anchored on the previous bucket's recorded point so
  // it forks off the solid line.
  const [nowT] = useState(() => Date.now());
  const chartData = useMemo(() => {
    let boundary = -1;
    series.forEach((r, i) => {
      if (r.t <= nowT) boundary = i;
    });
    const hasFuture =
      boundary < series.length - 1 ||
      series.some((r, i) => i >= boundary && r.planned_visits > 0);
    return series.map((r, i) => {
      const isPast = i <= boundary;
      return {
        ...r,
        pastVisits: isPast ? r.visits : null,
        futureVisits: !hasFuture
          ? null
          : i >= boundary
            ? r.visits + r.planned_visits
            : i === boundary - 1
              ? r.visits
              : null,
      };
    });
  }, [series, nowT]);

  // One evenly-spaced tick per calendar year (#51): the half-year bucket
  // boundaries read as unevenly spaced and "H1"/"H2" means nothing to viewers.
  const periodTicks = useMemo(() => {
    if (series.length === 0) return [];
    const years = new Set(series.map((r) => new Date(r.t).getUTCFullYear()));
    return [...years]
      .map((y) => Date.UTC(y, 0, 1))
      .filter((t) => t >= series[0].t && t <= series[series.length - 1].t);
  }, [series]);

  const activeRange = RANGES.find((r) => r.value === range);
  const rangeCaption = activeRange ? t(`dashboard.${activeRange.captionKey}`) : '';
  // People reached is shown as two separate tiles — in-person vs remote /
  // broadcast — because a big broadcast number would otherwise swamp the
  // in-person figure (#38).
  const remoteReached = summary?.total_people_reached_remote ?? 0;
  const inPersonReached = Math.max(0, (summary?.total_people_reached ?? 0) - remoteReached);

  // A brand-new instance would otherwise show a wall of zeros and empty charts
  // with nothing to do about it. Filters/siblings off means this really is an
  // empty instance rather than an over-narrow query.
  if (summary && summary.total_visits === 0 && !hasFilters && !includeSiblings) {
    return (
      <Stack>
        <div>
          <Title order={2}>{t('dashboard.title')}</Title>
          <Text c="dimmed" size="sm">
            {t('dashboard.subtitle')}
          </Text>
        </div>
        <Card withBorder p={0}>
          <EmptyState
            icon={IconCalendarStats}
            title={t('dashboard.emptyTitle')}
            description={t('dashboard.emptyDescription')}
            actionLabel={t('dashboard.emptyAction')}
            onAction={() => navigate('/visits/new')}
          />
        </Card>
      </Stack>
    );
  }

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
          <TextInput
            label={t('dashboard.peopleSearchLabel')}
            placeholder={t('dashboard.peopleSearchPlaceholder')}
            leftSection={<IconSearch size={16} />}
            value={peopleQuery}
            onChange={(event) => setPeopleQuery(event.currentTarget.value)}
            w={220}
          />
          <MultiSelect
            label={t('dashboard.venueTypeLabel')}
            placeholder={venueTypes.length ? undefined : t('common.all')}
            clearable
            searchable
            data={VENUE_TYPES.map((v) => ({ value: v, label: enumLabel.venueType(v) }))}
            value={venueTypes}
            onChange={setVenueTypes}
            w={200}
          />
          <MultiSelect
            label={t('dashboard.eventTypeLabel')}
            placeholder={eventTypes.length ? undefined : t('common.all')}
            clearable
            searchable
            data={EVENT_TYPES.map((v) => ({ value: v, label: enumLabel.eventType(v) }))}
            value={eventTypes}
            onChange={setEventTypes}
            w={200}
          />
          <MultiSelect
            label={t('dashboard.audienceLabel')}
            placeholder={audiences.length ? undefined : t('common.all')}
            clearable
            searchable
            data={AUDIENCE_LEVELS.map((v) => ({ value: v, label: enumLabel.audienceLevel(v) }))}
            value={audiences}
            onChange={setAudiences}
            w={200}
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
          {hasSiblings && (
            <Group gap={6} align="center" mb={6} wrap="nowrap">
              <Switch
                label={t('dashboard.includeSiblings')}
                checked={includeSiblings}
                onChange={(event) => setIncludeSiblings(event.currentTarget.checked)}
              />
              <HelpTooltip
                label={t('dashboard.siblingFilterCaveat')}
                multiline
                w={260}
                withArrow
                events={{ hover: true, focus: true, touch: true }}
              >
                <ThemeIcon variant="subtle" color="gray" size="sm" style={{ cursor: 'help' }}>
                  <IconInfoCircle size={16} />
                </ThemeIcon>
              </HelpTooltip>
            </Group>
          )}
          {hasFilters && (
            <Button variant="subtle" onClick={clearFilters}>
              {t('dashboard.clearFilters')}
            </Button>
          )}
        </Group>
      </FilterCard>

      {includeFederated && (
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
          label={t('dashboard.statPeopleInPerson')}
          value={summary ? inPersonReached.toLocaleString() : '—'}
          icon={IconUsers}
          color="grape"
          sub={t('dashboard.avgPerVisit', {
            formattedCount:
              summary && summary.total_visits > 0
                ? Math.round(inPersonReached / summary.total_visits).toLocaleString()
                : '0',
          })}
        />
        <StatTile
          label={t('dashboard.statPeopleRemote')}
          value={summary ? remoteReached.toLocaleString() : '—'}
          icon={IconBroadcast}
          color="cyan"
          sub={t('dashboard.remoteReachTileSub')}
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
      </SimpleGrid>

      <Title order={3} mt="sm">
        {t('dashboard.overTimeHeading')}
      </Title>
      {/* Events and people-reached each get their own panel; within the
          people panel, in-person and remote/broadcast use separate y-axes. */}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Skeleton visible={timeseries === undefined}>
          <TimePanel
            title={t('dashboard.visitsPer6Months')}
            data={chartData}
            ticks={periodTicks}
            lines={[{ key: 'pastVisits' }, { key: 'futureVisits', dashed: true }]}
            color={viz.series1}
            viz={viz}
            caption={t('dashboard.plannedCaption')}
          />
        </Skeleton>
        <Skeleton visible={timeseries === undefined}>
          <TimePanel
            title={t('dashboard.peopleReachedPer6Months')}
            data={chartData}
            ticks={periodTicks}
            // Split in-person vs remote/broadcast reach when any remote reach
            // exists, otherwise a single combined line. The two series get their
            // own y-axis (in-person left, remote right) so a huge broadcast
            // scale doesn't flatten the in-person line (#38).
            lines={
              (summary?.total_people_reached_remote ?? 0) > 0
                ? [
                    {
                      key: 'people_reached_in_person',
                      name: t('dashboard.peopleInPerson'),
                      color: viz.series2,
                      axis: 'left',
                    },
                    {
                      key: 'people_reached_remote',
                      name: t('dashboard.peopleRemote'),
                      color: viz.series1,
                      axis: 'right',
                    },
                  ]
                : [{ key: 'people_reached' }]
            }
            color={viz.series2}
            viz={viz}
          />
        </Skeleton>
      </SimpleGrid>

      <Title order={3} mt="sm">
        {t('dashboard.breakdownsHeading')}
      </Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Skeleton visible={byVenueType === undefined}>
          <BreakdownPanel
            title={t('dashboard.visitsByVenueType')}
            data={byVenueType ?? []}
            by="venueType"
            color={viz.series1}
            viz={viz}
          />
        </Skeleton>
        <Skeleton visible={byAudience === undefined}>
          <BreakdownPanel
            title={t('dashboard.visitsByAudienceLevel')}
            data={byAudience ?? []}
            by="audienceLevel"
            color={viz.series1}
            viz={viz}
          />
        </Skeleton>
        <Skeleton visible={byRelationship === undefined}>
          <BreakdownPanel
            title={t('dashboard.visitsByHostRelationship')}
            data={byRelationship ?? []}
            by="hostRelationship"
            color={viz.series2}
            viz={viz}
          />
        </Skeleton>
      </SimpleGrid>

      <Title order={3} mt="sm">
        {t('dashboard.leadersHeading')}
      </Title>
      <Text c="dimmed" size="xs">
        {t('dashboard.localOnlyNote')}
      </Text>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Skeleton visible={topVenues === undefined}>
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
          </Skeleton>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Skeleton visible={leaderboard === undefined}>
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
          </Skeleton>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
