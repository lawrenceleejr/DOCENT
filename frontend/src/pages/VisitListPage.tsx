import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Pagination,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buildQuery } from '../api/client';
import { api } from '../api/client';
import {
  AUDIENCE_LEVELS,
  EVENT_TYPES,
  labelize,
  VENUE_TYPES,
  type Paginated,
  type Visit,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { filterParams, type VisitFilters } from '../components/filters';

const PAGE_SIZE = 25;

export function VisitListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<VisitFilters>({});
  const [q, setQ] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [sort, setSort] = useState('-visit_date');
  const [page, setPage] = useState(1);

  const params = {
    ...filterParams(filters),
    q: q || undefined,
    author_id: mineOnly ? user?.id : undefined,
    sort,
    page,
    page_size: PAGE_SIZE,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['visits', params],
    queryFn: () => api.get<Paginated<Visit>>('/api/visits', params),
  });

  const update = (patch: Partial<VisitFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  // Clicking a header toggles between descending and ascending on that column.
  const toggleSort = (field: string) => {
    setSort((current) => (current === `-${field}` ? field : `-${field}`));
    setPage(1);
  };
  const sortIndicator = (field: string) =>
    sort === `-${field}` ? ' ▾' : sort === field ? ' ▴' : '';

  const exportHref = `/api/visits/export.csv${buildQuery({
    ...filterParams(filters),
    q: q || undefined,
    author_id: mineOnly ? user?.id : undefined,
  })}`;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Visits</Title>
        <Group>
          <Button component="a" href={exportHref} variant="default">
            Export CSV
          </Button>
          <Button onClick={() => navigate('/visits/new')}>Log a visit</Button>
        </Group>
      </Group>

      <Card withBorder p="md">
        <Group align="flex-end">
          <TextInput
            label="Search"
            placeholder="Title or notes"
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
            w={200}
          />
          <DatePickerInput
            label="From"
            placeholder="Any"
            clearable
            valueFormat="YYYY-MM-DD"
            value={filters.date_from ? new Date(`${filters.date_from}T00:00:00`) : null}
            onChange={(d) => update({ date_from: d ? toDateString(d) : undefined })}
          />
          <DatePickerInput
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
          <Switch
            label="Mine only"
            checked={mineOnly}
            onChange={(e) => {
              setMineOnly(e.currentTarget.checked);
              setPage(1);
            }}
            pb={8}
          />
        </Group>
      </Card>

      <Card withBorder p={0}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <UnstyledButton fw={700} fz="sm" onClick={() => toggleSort('visit_date')}>
                  Date{sortIndicator('visit_date')}
                </UnstyledButton>
              </Table.Th>
              <Table.Th>Title</Table.Th>
              <Table.Th>Venue</Table.Th>
              <Table.Th>Researcher</Table.Th>
              <Table.Th>Audience</Table.Th>
              <Table.Th ta="right">
                <UnstyledButton fw={700} fz="sm" onClick={() => toggleSort('people_reached')}>
                  People reached{sortIndicator('people_reached')}
                </UnstyledButton>
              </Table.Th>
              <Table.Th>
                <UnstyledButton fw={700} fz="sm" onClick={() => toggleSort('rating')}>
                  Rating{sortIndicator('rating')}
                </UnstyledButton>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.items ?? []).map((visit) => (
              <Table.Tr
                key={visit.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/visits/${visit.id}`)}
              >
                <Table.Td>{visit.visit_date}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/visits/${visit.id}`} onClick={(e) => e.stopPropagation()}>
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
                <Table.Td ta="right">{visit.people_reached.toLocaleString()}</Table.Td>
                <Table.Td>{visit.rating ? '★'.repeat(visit.rating) : '—'}</Table.Td>
              </Table.Tr>
            ))}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" ta="center" py="lg">
                    No visits yet — log your first outreach visit!
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {data ? `${data.total.toLocaleString()} visit${data.total === 1 ? '' : 's'}` : ''}
        </Text>
        <Pagination
          value={page}
          onChange={setPage}
          total={Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))}
        />
      </Group>
    </Stack>
  );
}

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
