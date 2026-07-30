import {
  Badge,
  Card,
  Group,
  Table,
  Text,
  UnstyledButton,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconChevronDown,
  IconChevronUp,
  IconHistory,
  IconLogin2,
  IconUserPlus,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import type { LoginHistory } from '../api/types';
import { VIZ_DARK, VIZ_LIGHT } from './vizTheme';

/** Short "M/D" label for the daily x-axis. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * Admin login-history section (#30): collapsed by default and rendered at the
 * very bottom of the admin panel. Only fetches once expanded.
 */
export function LoginHistoryCard() {
  const { t } = useTranslation();
  const [opened, { toggle }] = useDisclosure(false);
  const scheme = useComputedColorScheme('dark');
  const viz = scheme === 'dark' ? VIZ_DARK : VIZ_LIGHT;

  const { data } = useQuery({
    queryKey: ['admin', 'login-history'],
    queryFn: () => api.get<LoginHistory>('/api/admin/login-history'),
    enabled: opened,
  });

  const daily = data?.daily ?? [];
  const tickStep = Math.max(1, Math.floor(daily.length / 6));

  return (
    <Card withBorder p="md">
      <UnstyledButton onClick={toggle} w="100%">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <IconHistory size={18} />
            <div>
              <Text fw={600}>{t('admin.loginHistoryTitle')}</Text>
              <Text size="xs" c="dimmed">
                {t('admin.loginHistorySubtitle')}
              </Text>
            </div>
            {data && (
              <Badge variant="light" size="sm">
                {t('admin.loginHistoryTotal', {
                  count: data.total,
                  formattedCount: data.total.toLocaleString(),
                })}
              </Badge>
            )}
          </Group>
          {opened ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </Group>
      </UnstyledButton>

      {opened && (
        <div style={{ marginTop: 'var(--mantine-spacing-md)' }}>
          {data && data.total === 0 ? (
            <Text c="dimmed" size="sm" py="lg" ta="center">
              {t('admin.loginHistoryEmpty')}
            </Text>
          ) : (
            <>
              <Text fw={600} size="sm" mb="xs">
                {t('admin.loginHistoryChartTitle')}
              </Text>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={daily} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={viz.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    interval={tickStep - 1}
                    stroke={viz.axis}
                    tick={{ fill: viz.mutedInk, fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={viz.axis}
                    tick={{ fill: viz.mutedInk, fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: viz.tooltipBg,
                      color: viz.tooltipInk,
                      border: `1px solid ${viz.tooltipBorder}`,
                      borderRadius: 8,
                    }}
                    labelFormatter={(d: string) => d}
                    formatter={(value: number, name: string) => [
                      value.toLocaleString(),
                      name === 'registrations'
                        ? t('admin.loginHistoryRegistrationsLabel')
                        : t('admin.loginHistoryLoginsLabel'),
                    ]}
                  />
                  <Legend
                    formatter={(name: string) =>
                      name === 'registrations'
                        ? t('admin.loginHistoryRegistrationsLabel')
                        : t('admin.loginHistoryLoginsLabel')
                    }
                  />
                  <Bar dataKey="logins" stackId="events" fill={viz.series1} radius={[0, 0, 0, 0]} />
                  <Bar
                    dataKey="registrations"
                    stackId="events"
                    fill={viz.series2}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>

              <Text fw={600} size="sm" mt="md" mb="xs">
                {t('admin.loginHistoryRecentTitle')}
              </Text>
              <Table.ScrollContainer minWidth={420}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('admin.loginHistoryColUser')}</Table.Th>
                      <Table.Th>{t('admin.loginHistoryColEvent')}</Table.Th>
                      <Table.Th>{t('admin.loginHistoryColWhen')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(data?.recent ?? []).map((entry) => (
                      <Table.Tr key={entry.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {entry.user_name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {entry.user_email}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            size="sm"
                            color={entry.event_type === 'register' ? 'teal' : 'blue'}
                            leftSection={
                              entry.event_type === 'register' ? (
                                <IconUserPlus size={12} />
                              ) : (
                                <IconLogin2 size={12} />
                              )
                            }
                          >
                            {entry.event_type === 'register'
                              ? t('admin.loginHistoryEventRegister')
                              : t('admin.loginHistoryEventLogin')}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" className="tabular-nums">
                            {new Date(entry.created_at).toLocaleString()}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
