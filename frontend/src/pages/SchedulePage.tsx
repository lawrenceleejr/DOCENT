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
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, buildQuery } from '../api/client';
import { isOverdue, labelize, type Paginated, type Visit } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export function SchedulePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const params = {
    author_id: user?.id,
    status: 'planned',
    sort: 'visit_date', // soonest first
    page_size: 100,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['visits', 'schedule', params],
    queryFn: () => api.get<Paginated<Visit>>('/api/visits', params),
    enabled: !!user,
  });

  const icsHref = `/api/visits/calendar.ics${buildQuery({
    author_id: user?.id,
    status: 'planned',
  })}`;

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Schedule</Title>
          <Text c="dimmed" size="sm">
            Your upcoming planned events. Mark one done to record attendance.
          </Text>
        </div>
        <Group>
          <Button component="a" href={icsHref} variant="default">
            Add to calendar (.ics)
          </Button>
          <Button onClick={() => navigate('/visits/new?status=planned')}>
            Schedule an event
          </Button>
        </Group>
      </Group>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={640}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Time</Table.Th>
              <Table.Th>Title</Table.Th>
              <Table.Th>Venue</Table.Th>
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
                <Table.Td>
                  <Badge variant="light">{labelize(visit.audience_level)}</Badge>
                </Table.Td>
                <Table.Td ta="right">
                  <Button
                    size="compact-sm"
                    variant="light"
                    onClick={() => navigate(`/visits/${visit.id}/edit`)}
                  >
                    Mark done
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" ta="center" py="lg">
                    Nothing scheduled yet — plan an outreach event to see it here.
                  </Text>
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
