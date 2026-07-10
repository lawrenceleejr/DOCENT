import {
  Anchor,
  Badge,
  Card,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import {
  labelize,
  type Paginated,
  type VenueDetail,
  type Visit,
} from '../api/types';

export function VenueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: venue } = useQuery({
    queryKey: ['venues', id],
    queryFn: () => api.get<VenueDetail>(`/api/venues/${id}`),
  });
  const { data: visits } = useQuery({
    queryKey: ['visits', { venue_id: id }],
    queryFn: () =>
      api.get<Paginated<Visit>>('/api/visits', { venue_id: id, page_size: 100 }),
  });

  if (!venue) return null;

  const address = [venue.address, venue.city, venue.state, venue.country]
    .filter(Boolean)
    .join(', ');

  return (
    <Stack>
      <div>
        <Group gap="sm">
          <Title order={2}>{venue.name}</Title>
          <Badge variant="light" size="lg">
            {labelize(venue.venue_type)}
          </Badge>
        </Group>
        <Text c="dimmed">{address || 'No address recorded'}</Text>
      </div>

      <Group>
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Total visits
          </Text>
          <Text fz={28} fw={700}>
            {venue.visit_count}
          </Text>
        </Card>
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Last visit
          </Text>
          <Text fz={28} fw={700}>
            {venue.last_visit_date ?? '—'}
          </Text>
        </Card>
      </Group>

      {venue.notes && (
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Notes
          </Text>
          <Text>{venue.notes}</Text>
        </Card>
      )}

      <Title order={3}>Visit history</Title>
      <Card withBorder p={0}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Title</Table.Th>
              <Table.Th>Researcher</Table.Th>
              <Table.Th>Audience</Table.Th>
              <Table.Th ta="right">People reached</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(visits?.items ?? []).map((visit) => (
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
                <Table.Td>{visit.author.name}</Table.Td>
                <Table.Td>{labelize(visit.audience_level)}</Table.Td>
                <Table.Td ta="right">{visit.people_reached.toLocaleString()}</Table.Td>
              </Table.Tr>
            ))}
            {(visits?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center" py="lg">
                    No visits recorded at this venue yet
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
