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
import { IconCalendarPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, buildQuery } from '../api/client';
import {
  AUDIENCE_LEVELS,
  EVENT_TYPES,
  isOverdue,
  labelize,
  VENUE_TYPES,
  type Paginated,
  type Visit,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { filterParams, type VisitFilters } from '../components/filters';
import { toDateString } from './VisitListPage';

export function SchedulePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<VisitFilters>({});
  const [mineOnly, setMineOnly] = useState(false);

  const update = (patch: Partial<VisitFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const params = {
    ...filterParams(filters),
    status: 'planned',
    author_id: mineOnly ? user?.id : undefined,
    sort: 'visit_date', // soonest first
    page_size: 100,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['visits', 'schedule', params],
    queryFn: () => api.get<Paginated<Visit>>('/api/visits', params),
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

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Schedule</Title>
          <Text c="dimmed" size="sm">
            Upcoming planned events across the community. Mark one done to record attendance.
          </Text>
        </div>
        <Group>
          <Button component="a" href={icsHref} variant="default">
            Add to calendar (.ics)
          </Button>
          <Button variant="gradient" onClick={() => navigate('/visits/new?status=planned')}>
            Schedule an event
          </Button>
        </Group>
      </Group>

      <Card withBorder p="md">
        <Group align="flex-end">
          <DateInput
            label="From"
            placeholder="Any"
            clearable
            valueFormat="YYYY-MM-DD"
            value={filters.date_from ? new Date(`${filters.date_from}T00:00:00`) : null}
            onChange={(d) => update({ date_from: d ? toDateString(d) : undefined })}
          />
          <DateInput
            label="To"
            placeholder="Any"
            clearable
            valueFormat="YYYY-MM-DD"
            value={filters.date_to ? new Date(`${filters.date_to}T00:00:00`) : null}
            onChange={(d) => update({ date_to: d ? toDateString(d) : undefined })}
          />
          <Select
            label="Venue type"
            placeholder="All"
            clearable
            data={VENUE_TYPES.map((t) => ({ value: t, label: labelize(t) }))}
            value={filters.venue_type || null}
            onChange={(v) => update({ venue_type: (v ?? '') as VisitFilters['venue_type'] })}
          />
          <Select
            label="Event type"
            placeholder="All"
            clearable
            data={EVENT_TYPES.map((t) => ({ value: t, label: labelize(t) }))}
            value={filters.event_type || null}
            onChange={(v) => update({ event_type: (v ?? '') as VisitFilters['event_type'] })}
          />
          <Select
            label="Audience"
            placeholder="All"
            clearable
            data={AUDIENCE_LEVELS.map((t) => ({ value: t, label: labelize(t) }))}
            value={filters.audience_level || null}
            onChange={(v) =>
              update({ audience_level: (v ?? '') as VisitFilters['audience_level'] })
            }
          />
          <MultiSelect
            label="Tags"
            placeholder={filters.tags?.length ? undefined : 'Any'}
            clearable
            searchable
            data={tagOptions}
            value={filters.tags ?? []}
            onChange={(v) => update({ tags: v })}
            w={200}
          />
          <Switch
            label="Mine only"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.currentTarget.checked)}
            pb={8}
          />
        </Group>
      </Card>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={760}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Time</Table.Th>
              <Table.Th>Title</Table.Th>
              <Table.Th>Venue</Table.Th>
              <Table.Th>Communicator</Table.Th>
              <Table.Th>Audience</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.items ?? []).map((visit) => (
              <Table.Tr key={visit.id}>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    {visit.visit_date}
                    {isOverdue(visit) && (
                      <Badge variant="light" color="red" size="sm">
                        Overdue
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{visit.start_time ? visit.start_time.slice(0, 5) : '—'}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/visits/${visit.id}`}>
                    {visit.title}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  {visit.venue.name}
                  {visit.venue.city ? `, ${visit.venue.city}` : ''}
                </Table.Td>
                <Table.Td>{visit.author.name}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{labelize(visit.audience_level)}</Badge>
                </Table.Td>
                <Table.Td ta="right">
                  {(visit.author.id === user?.id || user?.is_admin) && (
                    <Button
                      size="compact-sm"
                      variant="light"
                      onClick={() => navigate(`/visits/${visit.id}/edit`)}
                    >
                      Mark done
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7} p={0}>
                  <EmptyState
                    icon={IconCalendarPlus}
                    title="Nothing scheduled"
                    description="No upcoming planned events match these filters. Schedule one and it will appear here — ready to export to your calendar."
                    actionLabel="Schedule an event"
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
