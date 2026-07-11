import {
  Button,
  Card,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconFileTypeCsv,
  IconFileTypePdf,
  IconJson,
  IconMarkdown,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, buildQuery } from '../api/client';
import {
  AUDIENCE_LEVELS,
  EVENT_TYPES,
  labelize,
  VENUE_TYPES,
  type ActivityReport,
  type ReportScope,
  type ReportStatusFilter,
} from '../api/types';
import { StatTile } from '../components/StatTile';
import { IconCalendarStats, IconMapPin, IconUsers } from '@tabler/icons-react';
import { toDateString } from './VisitListPage';

const PREVIEW_LIMIT = 50;

export function ReportsPage() {
  const [scope, setScope] = useState<ReportScope>('all');
  const [status, setStatus] = useState<ReportStatusFilter>('completed');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [venueType, setVenueType] = useState<string | null>(null);
  const [eventType, setEventType] = useState<string | null>(null);
  const [audience, setAudience] = useState<string | null>(null);

  const filterParams = {
    scope,
    status,
    date_from: dateFrom ? toDateString(dateFrom) : undefined,
    date_to: dateTo ? toDateString(dateTo) : undefined,
    venue_type: venueType ?? undefined,
    event_type: eventType ?? undefined,
    audience_level: audience ?? undefined,
  };

  const { data, isFetching } = useQuery({
    queryKey: ['report', filterParams],
    queryFn: () =>
      api.get<ActivityReport>('/api/reports/activities', { format: 'json', ...filterParams }),
  });

  const downloadHref = (format: 'json' | 'csv' | 'md' | 'pdf') =>
    `/api/reports/activities${buildQuery({ format, ...filterParams })}`;

  const rows = data?.rows ?? [];
  const shown = rows.slice(0, PREVIEW_LIMIT);

  const FORMATS = [
    { fmt: 'pdf' as const, label: 'PDF', icon: IconFileTypePdf },
    { fmt: 'csv' as const, label: 'CSV', icon: IconFileTypeCsv },
    { fmt: 'md' as const, label: 'Markdown', icon: IconMarkdown },
    { fmt: 'json' as const, label: 'JSON', icon: IconJson },
  ];

  return (
    <Stack>
      <div>
        <Title order={2}>Reports</Title>
        <Text c="dimmed" size="sm">
          Export a shareable summary of outreach activity — for grant reports and annual
          reviews. Private notes, reflections, and ratings are never included.
        </Text>
      </div>

      <Card withBorder p="lg">
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <div>
              <Text size="sm" fw={500} mb={4}>
                Whose activities
              </Text>
              <SegmentedControl
                fullWidth
                value={scope}
                onChange={(v) => setScope(v as ReportScope)}
                data={[
                  { label: 'My activities', value: 'mine' },
                  { label: 'Everyone', value: 'all' },
                ]}
              />
            </div>
            <div>
              <Text size="sm" fw={500} mb={4}>
                Status
              </Text>
              <SegmentedControl
                fullWidth
                value={status}
                onChange={(v) => setStatus(v as ReportStatusFilter)}
                data={[
                  { label: 'Completed', value: 'completed' },
                  { label: 'Planned', value: 'planned' },
                  { label: 'All', value: 'all' },
                ]}
              />
            </div>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <DatePickerInput
              label="From"
              placeholder="Earliest"
              clearable
              valueFormat="YYYY-MM-DD"
              value={dateFrom}
              onChange={setDateFrom}
            />
            <DatePickerInput
              label="To"
              placeholder="Latest"
              clearable
              valueFormat="YYYY-MM-DD"
              value={dateTo}
              onChange={setDateTo}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Select
              label="Venue type"
              placeholder="All"
              clearable
              data={VENUE_TYPES.map((t) => ({ value: t, label: labelize(t) }))}
              value={venueType}
              onChange={setVenueType}
            />
            <Select
              label="Event type"
              placeholder="All"
              clearable
              data={EVENT_TYPES.map((t) => ({ value: t, label: labelize(t) }))}
              value={eventType}
              onChange={setEventType}
            />
            <Select
              label="Audience"
              placeholder="All"
              clearable
              data={AUDIENCE_LEVELS.map((t) => ({ value: t, label: labelize(t) }))}
              value={audience}
              onChange={setAudience}
            />
          </SimpleGrid>

          <div>
            <Text size="sm" fw={500} mb={6}>
              Download
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
          </div>
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, xs: 3 }}>
        <StatTile
          label="Activities"
          value={data?.summary.total_activities.toLocaleString() ?? '—'}
          icon={IconCalendarStats}
          color="brand"
        />
        <StatTile
          label="People reached"
          value={data?.summary.total_people_reached.toLocaleString() ?? '—'}
          icon={IconUsers}
          color="grape"
        />
        <StatTile
          label="Distinct venues"
          value={data?.summary.distinct_venues ?? '—'}
          icon={IconMapPin}
          color="teal"
        />
      </SimpleGrid>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={720}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Activity</Table.Th>
                <Table.Th>Event</Table.Th>
                <Table.Th>Venue</Table.Th>
                <Table.Th>Audience</Table.Th>
                <Table.Th ta="right">People</Table.Th>
                <Table.Th>Presenter</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((r, i) => (
                <Table.Tr key={i}>
                  <Table.Td className="tabular-nums">{r.date}</Table.Td>
                  <Table.Td>{r.title}</Table.Td>
                  <Table.Td>{r.event_type}</Table.Td>
                  <Table.Td>
                    {r.venue}
                    {r.city ? `, ${r.city}` : ''}
                  </Table.Td>
                  <Table.Td>{r.audience}</Table.Td>
                  <Table.Td ta="right" className="tabular-nums">
                    {r.people_reached.toLocaleString()}
                  </Table.Td>
                  <Table.Td>{r.presenter}</Table.Td>
                </Table.Tr>
              ))}
              {!isFetching && rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="xl">
                      No activities match these filters. Try “Everyone” instead of “My
                      activities”, set Status to “All”, or widen the date range.
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
          Showing the first {PREVIEW_LIMIT} of {rows.length.toLocaleString()} activities. The
          download includes all of them.
        </Text>
      )}
    </Stack>
  );
}
