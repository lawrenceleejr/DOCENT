import {
  Anchor,
  Badge,
  Card,
  Center,
  Container,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import { IconCalendarStats, IconMapPin, IconUserBolt, IconUsers } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ApiError } from '../api/client';
import { type PublicImpact } from '../api/types';
import { Logo } from '../components/Logo';
import { StatTile } from '../components/StatTile';
import { VIZ_DARK, VIZ_LIGHT } from '../components/vizTheme';
import { useEnumLabel } from '../i18n/enumLabels';
import { buildTimeSeries, type TimeRow } from './DashboardPage';

function PublicTimePanel({
  title,
  data,
  dataKey,
  color,
  viz,
}: {
  title: string;
  data: TimeRow[];
  dataKey: 'visits' | 'people_reached';
  color: string;
  viz: typeof VIZ_LIGHT;
}) {
  const ticks = useMemo(() => {
    if (data.length === 0) return [];
    const years = new Set(data.map((d) => new Date(d.t).getUTCFullYear()));
    return [...years]
      .map((y) => Date.UTC(y, 0, 1))
      .filter((t) => t >= data[0].t && t <= data[data.length - 1].t);
  }, [data]);
  return (
    <Card withBorder p="md">
      <Text fw={600} mb="xs">
        {title}
      </Text>
      <ResponsiveContainer width="100%" height={180}>
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
            contentStyle={{
              backgroundColor: viz.tooltipBg,
              border: `1px solid ${viz.tooltipBorder}`,
              borderRadius: 6,
              color: viz.tooltipInk,
              fontSize: 13,
            }}
            labelFormatter={(t: number) => data.find((d) => d.t === t)?.label ?? ''}
            formatter={(value: number) => [value.toLocaleString(), title]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function PublicImpactPage() {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const scheme = useComputedColorScheme('dark');
  const viz = scheme === 'dark' ? VIZ_DARK : VIZ_LIGHT;
  const [includeSiblings, setIncludeSiblings] = useState(false);

  const { data, error, isLoading } = useQuery({
    queryKey: ['public', 'impact', includeSiblings],
    queryFn: () =>
      api.get<PublicImpact>('/api/public/impact', { include_federated: includeSiblings }),
    retry: false,
  });

  const name = data?.site_name || 'DOCENT';
  useEffect(() => {
    document.title = `${name} · Impact`;
  }, [name]);

  const series = useMemo(() => buildTimeSeries(data?.timeseries ?? []), [data]);
  const maxTypeVisits = Math.max(1, ...(data?.by_venue_type ?? []).map((r) => r.visits));

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (error instanceof ApiError || !data) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="xs">
          <Logo size={48} />
          <Title order={3}>{t('impact.unavailableTitle')}</Title>
          <Text c="dimmed" size="sm">
            {t('impact.unavailableDescription')}
          </Text>
          <Anchor component={Link} to="/login" size="sm">
            {t('impact.signIn')}
          </Anchor>
        </Stack>
      </Center>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <Logo size={40} ping />
            <div>
              <Title order={2}>{name}</Title>
              <Text c="dimmed" size="sm">
                {t('impact.tagline')}
              </Text>
            </div>
          </Group>
          <Group gap="md">
            <Switch
              size="sm"
              checked={includeSiblings}
              onChange={(event) => setIncludeSiblings(event.currentTarget.checked)}
              label={t('impact.includeSiblings')}
            />
            <Anchor component={Link} to="/login" size="sm" c="dimmed">
              {t('impact.signInLink')}
            </Anchor>
          </Group>
        </Group>

        {includeSiblings && (
          <Text size="xs" c="dimmed">
            {t('impact.includingSiblings')}
          </Text>
        )}

        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <StatTile
            label={t('impact.statOutreachEvents')}
            value={data.total_visits.toLocaleString()}
            icon={IconCalendarStats}
            color="brand"
          />
          <StatTile
            label={t('impact.statPeopleReached')}
            value={data.total_people_reached.toLocaleString()}
            icon={IconUsers}
            color="grape"
          />
          <StatTile
            label={t('impact.statVenuesVisited')}
            value={data.distinct_venues.toLocaleString()}
            icon={IconMapPin}
            color="teal"
          />
          <StatTile
            label={t('impact.statCommunicators')}
            value={data.active_communicators.toLocaleString()}
            icon={IconUserBolt}
            color="indigo"
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <PublicTimePanel
            title={t('impact.eventsPer6Months')}
            data={series}
            dataKey="visits"
            color={viz.series1}
            viz={viz}
          />
          <PublicTimePanel
            title={t('impact.peopleReachedPer6Months')}
            data={series}
            dataKey="people_reached"
            color={viz.series2}
            viz={viz}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Card withBorder p="md">
            <Text fw={600} mb="sm">
              {t('impact.whereWeGoHeading')}
            </Text>
            <Stack gap={8}>
              {data.by_venue_type.map((row) => (
                <div key={row.key}>
                  <Group justify="space-between" mb={2}>
                    <Text size="sm">{enumLabel.venueType(row.key)}</Text>
                    <Text size="sm" c="dimmed">
                      {t('impact.venueBreakdownCaption', {
                        count: row.visits,
                        formattedCount: row.visits.toLocaleString(),
                        formattedPeopleCount: row.people_reached.toLocaleString(),
                      })}
                    </Text>
                  </Group>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      width: `${(row.visits / maxTypeVisits) * 100}%`,
                      minWidth: 8,
                      background: viz.series1,
                    }}
                  />
                </div>
              ))}
              {data.by_venue_type.length === 0 && (
                <Text c="dimmed" size="sm">
                  {t('impact.noCompletedEvents')}
                </Text>
              )}
            </Stack>
          </Card>

          <Card withBorder p="md">
            <Text fw={600} mb="sm">
              {t('impact.recentActivityHeading')}
            </Text>
            <Table>
              <Table.Tbody>
                {data.recent.map((a, i) => (
                  <Table.Tr key={i}>
                    <Table.Td className="tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                      {a.visit_date}
                    </Table.Td>
                    <Table.Td>
                      {a.title}
                      <Text span c="dimmed" size="sm">
                        {' '}
                        — {a.venue_name}
                        {a.venue_city ? `, ${a.venue_city}` : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Badge variant="light">{enumLabel.eventType(a.event_type)}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {data.recent.length === 0 && (
                  <Table.Tr>
                    <Table.Td>
                      <Text c="dimmed" size="sm">
                        {t('impact.noCompletedEvents')}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Card>
        </SimpleGrid>

        <Text size="xs" c="dimmed" ta="center">
          {t('impact.poweredByPrefix')}{' '}
          <Anchor href="https://github.com/lawrenceleejr/DOCENT" target="_blank" c="dimmed" underline="always">
            DOCENT
          </Anchor>{' '}
          {t('impact.poweredBySuffix')}
        </Text>
      </Stack>
    </Container>
  );
}
