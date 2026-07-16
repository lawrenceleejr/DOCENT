import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  MultiSelect,
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
import { DateInput } from '@mantine/dates';
import { IconClipboardList } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { FilterCard } from '../components/FilterCard';
import { buildQuery } from '../api/client';
import { api } from '../api/client';
import {
  AUDIENCE_LEVELS,
  EVENT_TYPES,
  isOverdue,
  labelize,
  VENUE_TYPES,
  VISIT_STATUSES,
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
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [sort, setSort] = useState('-visit_date');
  const [page, setPage] = useState(1);

  const params = {
    ...filterParams(filters),
    q: q || undefined,
    status: statusFilter ?? undefined,
    author_id: mineOnly ? user?.id : undefined,
    sort,
    page,
    page_size: PAGE_SIZE,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['visits', params],
    queryFn: () => api.get<Paginated<Visit>>('/api/visits', params),
  });

  const { data: tagOptions = [] } = useQuery({
    queryKey: ['visits', 'tags'],
    queryFn: () => api.get<string[]>('/api/visits/tags'),
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

  const activeFilterCount =
    [q, statusFilter, filters.date_from, filters.date_to, filters.venue_type,
      filters.event_type, filters.audience_level].filter(Boolean).length +
    ((filters.tags?.length ?? 0) > 0 ? 1 : 0) +
    (mineOnly ? 1 : 0);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Visits</Title>
        <Group>
          <Button component="a" href={exportHref} variant="default">
            Export CSV
          </Button>
          <Button variant="gradient" onClick={() => navigate('/visits/new')}>
            Log a visit
          </Button>
        </Group>
      </Group>

      <FilterCard activeCount={activeFilterCount}>
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
          <Select
            label="Status"
            placeholder="All"
            clearable
            data={VISIT_STATUSES.map((s) => ({ value: s, label: labelize(s) }))}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          />
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
            onChange={(e) => {
              setMineOnly(e.currentTarget.checked);
              setPage(1);
            }}
            pb={8}
          />
        </Group>
      </FilterCard>

      <Card withBorder p={0} visibleFrom="sm">
        <Table.ScrollContainer minWidth={780}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <UnstyledButton fw={700} fz="sm" onClick={() => toggleSort('visit_date')}>
                  Date{sortIndicator('visit_date')}
                </UnstyledButton>
              </Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Title</Table.Th>
              <Table.Th>Venue</Table.Th>
              <Table.Th>Communicator</Table.Th>
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
                <Table.Td>
                  {visit.visit_date}
                  {visit.start_time ? ` ${visit.start_time.slice(0, 5)}` : ''}
                </Table.Td>
                <Table.Td>
                  {isOverdue(visit) ? (
                    <Badge variant="light" color="red">
                      Overdue
                    </Badge>
                  ) : (
                    <Badge variant="light" color={visit.status === 'planned' ? 'blue' : 'green'}>
                      {labelize(visit.status)}
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/visits/${visit.id}`} onClick={(e) => e.stopPropagation()}>
                    {visit.title}
                  </Anchor>
                  {visit.tags.length > 0 && (
                    <Group gap={4} mt={4}>
                      {visit.tags.map((t) => (
                        <Badge key={t} size="xs" variant="light" color="grape">
                          {t}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </Table.Td>
                <Table.Td>
                  {visit.venue.name}
                  {visit.venue.city ? `, ${visit.venue.city}` : ''}
                </Table.Td>
                <Table.Td>{visit.author.name}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{labelize(visit.audience_level)}</Badge>
                </Table.Td>
                <Table.Td ta="right" className="tabular-nums">
                  {visit.people_reached.toLocaleString()}
                </Table.Td>
                <Table.Td>
                  {visit.rating ? (
                    <Text span c="yellow.5">
                      {'★'.repeat(visit.rating)}
                    </Text>
                  ) : (
                    '—'
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={8} p={0}>
                  <EmptyState
                    icon={IconClipboardList}
                    title="No visits found"
                    description="No visits match these filters yet. Log your first outreach visit to get started."
                    actionLabel="Log a visit"
                    onAction={() => navigate('/visits/new')}
                  />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
        </Table.ScrollContainer>
      </Card>

      {/* Mobile: stacked cards instead of a horizontally-scrolled table. */}
      <Stack hiddenFrom="sm" gap="sm">
        {(data?.items ?? []).map((visit) => (
          <VisitCard key={visit.id} visit={visit} onClick={() => navigate(`/visits/${visit.id}`)} />
        ))}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <Card withBorder p={0}>
            <EmptyState
              icon={IconClipboardList}
              title="No visits found"
              description="No visits match these filters yet."
              actionLabel="Log a visit"
              onAction={() => navigate('/visits/new')}
            />
          </Card>
        )}
      </Stack>

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

export function VisitStatusBadge({ visit }: { visit: Visit }) {
  if (isOverdue(visit)) {
    return (
      <Badge variant="light" color="red">
        Overdue
      </Badge>
    );
  }
  return (
    <Badge variant="light" color={visit.status === 'planned' ? 'blue' : 'green'}>
      {labelize(visit.status)}
    </Badge>
  );
}

function VisitCard({ visit, onClick }: { visit: Visit; onClick: () => void }) {
  return (
    <Card withBorder p="md" onClick={onClick} style={{ cursor: 'pointer' }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text fw={600} lineClamp={2} style={{ minWidth: 0 }}>
          {visit.title}
        </Text>
        <Box style={{ flexShrink: 0 }}>
          <VisitStatusBadge visit={visit} />
        </Box>
      </Group>
      <Text size="sm" c="dimmed" mt={4}>
        {visit.visit_date}
        {visit.start_time ? ` · ${visit.start_time.slice(0, 5)}` : ''}
      </Text>
      <Text size="sm" mt={2}>
        {visit.venue.name}
        {visit.venue.city ? `, ${visit.venue.city}` : ''}
      </Text>
      <Group justify="space-between" mt="sm" wrap="nowrap">
        <Badge variant="light" size="sm">
          {labelize(visit.audience_level)}
        </Badge>
        <Group gap="md" wrap="nowrap">
          {visit.rating ? (
            <Text span size="sm" c="yellow.5">
              {'★'.repeat(visit.rating)}
            </Text>
          ) : null}
          <Text size="sm" c="dimmed" className="tabular-nums">
            {visit.people_reached.toLocaleString()} reached
          </Text>
        </Group>
      </Group>
    </Card>
  );
}

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
