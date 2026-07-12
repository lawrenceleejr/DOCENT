import {
  Anchor,
  Card,
  Grid,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
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
  labelize,
  type BreakdownRow,
  type LeaderboardRow,
  type StatsSummary,
  type TimeseriesPoint,
  type TopVenueRow,
} from '../api/types';
import { StatTile } from '../components/StatTile';
import { VIZ_DARK, VIZ_LIGHT } from '../components/vizTheme';
import { toDateString } from './VisitListPage';

const RANGES = [
  { label: 'Last 3 years', value: '3y' },
  { label: 'Last 5 years', value: '5y' },
  { label: 'All time', value: 'all' },
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

interface TimeRow {
  t: number; // epoch ms of the half-year bucket start (for a real time axis)
  label: string; // e.g. "2026 H1"
  visits: number;
  people_reached: number;
}

const halfStart = (year: number, half: 1 | 2) => Date.UTC(year, half === 1 ? 0 : 6, 1);

/** Turn "YYYY H1"/"YYYY H2" rows into a gap-filled series on a real time axis:
 * every 6-month bucket between the first and last present period is included
 * (missing ones as zero), so spacing reflects actual elapsed time. */
function buildTimeSeries(points: TimeseriesPoint[]): TimeRow[] {
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
  color,
  viz,
}: {
  title: string;
  data: BreakdownRow[];
  color: string;
  viz: typeof VIZ_LIGHT;
}) {
  const rows = data.map((row) => ({ ...row, label: labelize(row.key) }));
  const height = rows.length <= 1 ? 96 : Math.max(140, rows.length * 38 + 24);
  return (
    <Card withBorder p="md">
      <Text fw={600} mb="xs">
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text c="dimmed" size="sm" py="xl" ta="center">
          No data recorded in this range yet.
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
              name === 'visits' ? 'Visits' : 'People reached',
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
  const scheme = useComputedColorScheme('dark');
  const viz = scheme === 'dark' ? VIZ_DARK : VIZ_LIGHT;
  const [range, setRange] = useState<RangeKey>('3y');
  const dates = useMemo(() => rangeToDates(range), [range]);

  const { data: summary } = useQuery({
    queryKey: ['stats', 'summary', dates],
    queryFn: () => api.get<StatsSummary>('/api/stats/summary', dates),
  });
  const { data: timeseries } = useQuery({
    queryKey: ['stats', 'timeseries', dates],
    queryFn: () => api.get<TimeseriesPoint[]>('/api/stats/timeseries', dates),
  });
  const { data: byVenueType } = useQuery({
    queryKey: ['stats', 'breakdown', 'venue_type', dates],
    queryFn: () =>
      api.get<BreakdownRow[]>('/api/stats/breakdown', { by: 'venue_type', ...dates }),
  });
  const { data: byAudience } = useQuery({
    queryKey: ['stats', 'breakdown', 'audience_level', dates],
    queryFn: () =>
      api.get<BreakdownRow[]>('/api/stats/breakdown', { by: 'audience_level', ...dates }),
  });
  const { data: byRelationship } = useQuery({
    queryKey: ['stats', 'breakdown', 'host_relationship', dates],
    queryFn: () =>
      api.get<BreakdownRow[]>('/api/stats/breakdown', { by: 'host_relationship', ...dates }),
  });
  const { data: topVenues } = useQuery({
    queryKey: ['stats', 'top-venues', dates],
    queryFn: () => api.get<TopVenueRow[]>('/api/stats/top-venues', { limit: 10, ...dates }),
  });
  const { data: leaderboard } = useQuery({
    queryKey: ['stats', 'leaderboard', dates],
    queryFn: () => api.get<LeaderboardRow[]>('/api/stats/leaderboard', { limit: 20, ...dates }),
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

  const rangeLabel = RANGES.find((r) => r.value === range)?.label.toLowerCase() ?? '';
  const avgPerVisit =
    summary && summary.total_visits > 0
      ? Math.round(summary.total_people_reached / summary.total_visits)
      : null;

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Analysis</Title>
          <Text c="dimmed" size="sm">
            Your community’s collective outreach impact.
          </Text>
        </div>
        <SegmentedControl
          value={range}
          onChange={(value) => setRange(value as RangeKey)}
          data={RANGES.map((r) => ({ label: r.label, value: r.value }))}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, xs: 2, md: 5 }}>
        <StatTile
          label="Visits"
          value={summary?.total_visits.toLocaleString() ?? '—'}
          icon={IconCalendarStats}
          color="brand"
          sub={rangeLabel}
        />
        <StatTile
          label="People reached"
          value={summary?.total_people_reached.toLocaleString() ?? '—'}
          icon={IconUsers}
          color="grape"
          sub={avgPerVisit != null ? `~${avgPerVisit.toLocaleString()} per visit` : undefined}
        />
        <StatTile
          label="Venues visited"
          value={summary?.distinct_venues ?? '—'}
          icon={IconMapPin}
          color="teal"
          sub="distinct locations"
        />
        <StatTile
          label="Active communicators"
          value={summary?.active_communicators ?? '—'}
          icon={IconUserBolt}
          color="indigo"
          sub="contributing"
        />
        <StatTile
          label="Avg. rating"
          value={summary?.avg_rating != null ? `${summary.avg_rating}` : '—'}
          icon={IconStar}
          color="yellow"
          sub="out of 5"
        />
      </SimpleGrid>

      <Title order={3} mt="sm">
        Over time
      </Title>
      {/* Two measures, two panels — never a dual-axis chart. */}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <TimePanel
          title="Visits per 6 months"
          data={series}
          ticks={yearTicks}
          dataKey="visits"
          color={viz.series1}
          viz={viz}
        />
        <TimePanel
          title="People reached per 6 months"
          data={series}
          ticks={yearTicks}
          dataKey="people_reached"
          color={viz.series2}
          viz={viz}
        />
      </SimpleGrid>

      <Title order={3} mt="sm">
        Breakdowns
      </Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <BreakdownPanel
          title="Visits by venue type"
          data={byVenueType ?? []}
          color={viz.series1}
          viz={viz}
        />
        <BreakdownPanel
          title="Visits by audience level"
          data={byAudience ?? []}
          color={viz.series1}
          viz={viz}
        />
        <BreakdownPanel
          title="Visits by host relationship"
          data={byRelationship ?? []}
          color={viz.series2}
          viz={viz}
        />
      </SimpleGrid>

      <Title order={3} mt="sm">
        Leaders
      </Title>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder p="md">
            <Text fw={600} mb="xs">
              Top venues
            </Text>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Venue</Table.Th>
                  <Table.Th ta="right">Visits</Table.Th>
                  <Table.Th ta="right">People reached</Table.Th>
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
                        No data in this range
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
              Communicator leaderboard
            </Text>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Communicator</Table.Th>
                  <Table.Th ta="right">Visits</Table.Th>
                  <Table.Th ta="right">People reached</Table.Th>
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
                        No data in this range
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
