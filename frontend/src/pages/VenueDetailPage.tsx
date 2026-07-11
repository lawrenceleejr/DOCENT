import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  labelize,
  type Paginated,
  type VenueDetail,
  type Visit,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { VenueFormModal } from '../components/VenuePicker';

export function VenueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, edit] = useDisclosure(false);

  const { data: venue } = useQuery({
    queryKey: ['venues', id],
    queryFn: () => api.get<VenueDetail>(`/api/venues/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/venues/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] });
      notifications.show({ message: 'Venue deleted' });
      navigate('/venues');
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Could not delete venue',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
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
  const canManage = user && (user.id === venue.created_by_id || user.is_admin);

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{venue.name}</Title>
            <Badge variant="light" size="lg">
              {labelize(venue.venue_type)}
            </Badge>
          </Group>
          <Text c="dimmed">{address || 'No address recorded'}</Text>
        </div>
        {canManage && (
          <Group>
            <Button variant="default" onClick={edit.open}>
              Edit
            </Button>
            <Button
              color="red"
              variant="light"
              loading={remove.isPending}
              onClick={() => {
                if (venue.visit_count > 0) {
                  notifications.show({
                    color: 'red',
                    title: 'Cannot delete venue',
                    message: `This venue has ${venue.visit_count} visit(s). Delete or reassign them first.`,
                  });
                  return;
                }
                if (window.confirm('Delete this venue? This cannot be undone.')) {
                  remove.mutate();
                }
              }}
            >
              Delete
            </Button>
          </Group>
        )}
      </Group>

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
        <Table.ScrollContainer minWidth={640}>
        <Table highlightOnHover stickyHeader stickyHeaderOffset={60}>
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
        </Table.ScrollContainer>
      </Card>

      <VenueFormModal
        opened={editing}
        onClose={edit.close}
        venue={venue}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['venues'] });
          edit.close();
        }}
      />
    </Stack>
  );
}
