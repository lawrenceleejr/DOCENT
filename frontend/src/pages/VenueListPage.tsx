import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { labelize, VENUE_TYPES, type Paginated, type VenueListItem } from '../api/types';
import { VenueFormModal } from '../components/VenuePicker';

const PAGE_SIZE = 25;

export function VenueListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [venueType, setVenueType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [creating, create] = useDisclosure(false);

  const params = {
    q: q || undefined,
    venue_type: venueType ?? undefined,
    page,
    page_size: PAGE_SIZE,
  };
  const { data } = useQuery({
    queryKey: ['venues', 'list', params],
    queryFn: () => api.get<Paginated<VenueListItem>>('/api/venues', params),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Venues</Title>
        <Button onClick={create.open}>Add venue</Button>
      </Group>

      <Card withBorder p="md">
        <Group align="flex-end">
          <TextInput
            label="Search"
            placeholder="Name or city"
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
            w={280}
          />
          <Select
            label="Type"
            placeholder="All"
            clearable
            data={VENUE_TYPES.map((t) => ({ value: t, label: labelize(t) }))}
            value={venueType}
            onChange={(v) => {
              setVenueType(v);
              setPage(1);
            }}
          />
        </Group>
      </Card>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={620}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>City</Table.Th>
              <Table.Th>State</Table.Th>
              <Table.Th ta="right">Visits</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.items ?? []).map((venue) => (
              <Table.Tr
                key={venue.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/venues/${venue.id}`)}
              >
                <Table.Td>
                  <Anchor component={Link} to={`/venues/${venue.id}`} onClick={(e) => e.stopPropagation()}>
                    {venue.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{labelize(venue.venue_type)}</Badge>
                </Table.Td>
                <Table.Td>{venue.city ?? '—'}</Table.Td>
                <Table.Td>{venue.state ?? '—'}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {venue.visit_count}
                </Table.Td>
              </Table.Tr>
            ))}
            {(data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center" py="lg">
                    No venues found
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
        </Table.ScrollContainer>
      </Card>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {data ? `${data.total.toLocaleString()} venue${data.total === 1 ? '' : 's'}` : ''}
        </Text>
        <Pagination
          value={page}
          onChange={setPage}
          total={Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))}
        />
      </Group>

      <VenueFormModal
        opened={creating}
        onClose={create.close}
        onSaved={(venue) => {
          queryClient.invalidateQueries({ queryKey: ['venues'] });
          create.close();
          navigate(`/venues/${venue.id}`);
        }}
      />
    </Stack>
  );
}
