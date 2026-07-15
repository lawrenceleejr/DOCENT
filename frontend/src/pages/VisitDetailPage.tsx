import {
  Anchor,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Rating,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { COVERAGE_LABELS, isOverdue, labelize, type Visit } from '../api/types';
import { useAuth } from '../auth/AuthContext';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text>{children}</Text>
    </div>
  );
}

export function VisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: visit, isLoading } = useQuery({
    queryKey: ['visits', id],
    queryFn: () => api.get<Visit>(`/api/visits/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/visits/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      notifications.show({ message: 'Visit deleted' });
      navigate('/');
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Could not delete visit',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  if (isLoading || !visit) return null;

  const canEdit = user && (user.id === visit.author.id || user.is_admin);

  return (
    <Stack maw={720} mx="auto">
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{visit.title}</Title>
            <Badge
              variant="light"
              size="lg"
              color={isOverdue(visit) ? 'red' : visit.status === 'planned' ? 'blue' : 'green'}
            >
              {isOverdue(visit) ? 'Overdue' : labelize(visit.status)}
            </Badge>
          </Group>
          <Text c="dimmed">
            {visit.visit_date}
            {visit.start_time ? ` at ${visit.start_time.slice(0, 5)}` : ''} ·{' '}
            <Anchor component={Link} to={`/venues/${visit.venue.id}`}>
              {visit.venue.name}
            </Anchor>
            {visit.venue.city ? `, ${visit.venue.city}` : ''}
          </Text>
        </div>
        {canEdit && (
          <Group>
            {visit.status === 'planned' && (
              <Button variant="gradient" onClick={() => navigate(`/visits/${visit.id}/edit`)}>
                Mark as completed
              </Button>
            )}
            <Button variant="default" onClick={() => navigate(`/visits/${visit.id}/edit`)}>
              Edit
            </Button>
            <Button
              color="red"
              variant="light"
              loading={remove.isPending}
              onClick={() => {
                if (window.confirm('Delete this visit? This cannot be undone.')) {
                  remove.mutate();
                }
              }}
            >
              Delete
            </Button>
          </Group>
        )}
      </Group>

      <Card withBorder p="lg">
        <Stack gap="md">
          <Group grow>
            <Field label="Communicator">{visit.author.name}</Field>
            <Field label="Event type">
              <Badge variant="light">{labelize(visit.event_type)}</Badge>
            </Field>
            <Field label="Audience">
              <Badge variant="light">{labelize(visit.audience_level)}</Badge>
            </Field>
          </Group>
          <Group grow>
            <Field label="People reached">{visit.people_reached.toLocaleString()}</Field>
            <Field label="Duration">
              {visit.duration_minutes ? `${visit.duration_minutes} min` : '—'}
            </Field>
            <Field label="Follow-up planned">{visit.follow_up_planned ? 'Yes' : 'No'}</Field>
          </Group>
          {visit.rating !== null && (
            <Field label="How it went">
              <Rating value={visit.rating} readOnly />
            </Field>
          )}
          {visit.description && <Field label="Description">{visit.description}</Field>}
          {visit.reflection && <Field label="Reflection">{visit.reflection}</Field>}
          {visit.additional_presenters && (
            <Field label="Additional presenters">{visit.additional_presenters}</Field>
          )}
          {visit.tags.length > 0 && (
            <Field label="Tags">
              <Group gap={6}>
                {visit.tags.map((t) => (
                  <Badge key={t} variant="light" color="grape">
                    {t}
                  </Badge>
                ))}
              </Group>
            </Field>
          )}
          {visit.links.length > 0 && (
            <Field label="Coverage & links">
              <Stack gap={6}>
                {visit.links.map((lk, i) => (
                  <Group key={i} gap={8} wrap="nowrap">
                    <Badge variant="light" color="blue" size="sm" style={{ flexShrink: 0 }}>
                      {COVERAGE_LABELS[lk.category] ?? lk.category}
                    </Badge>
                    <Anchor
                      href={lk.url}
                      target="_blank"
                      rel="noreferrer"
                      size="sm"
                      lineClamp={1}
                      style={{ minWidth: 0, flex: 1 }}
                    >
                      {lk.label || lk.url}
                    </Anchor>
                  </Group>
                ))}
              </Stack>
            </Field>
          )}
          {(visit.contact_name ||
            visit.contact_email ||
            visit.contact_phone ||
            visit.host_role ||
            visit.host_relationship ||
            visit.host_relationship_detail ||
            visit.host_notes) && (
            <>
              <Divider label="Host" labelPosition="left" />
              <Group grow>
                {visit.contact_name && <Field label="Name">{visit.contact_name}</Field>}
                {visit.host_role && <Field label="Role / title">{visit.host_role}</Field>}
                {(visit.host_relationship || visit.host_relationship_detail) && (
                  <Field label="Relationship">
                    {[
                      visit.host_relationship ? labelize(visit.host_relationship) : null,
                      visit.host_relationship_detail,
                    ]
                      .filter(Boolean)
                      .join(' — ')}
                  </Field>
                )}
              </Group>
              {(visit.contact_email || visit.contact_phone) && (
                <Group grow>
                  {visit.contact_email && (
                    <Field label="Email">
                      <Anchor href={`mailto:${visit.contact_email}`}>{visit.contact_email}</Anchor>
                    </Field>
                  )}
                  {visit.contact_phone && <Field label="Phone">{visit.contact_phone}</Field>}
                </Group>
              )}
              {visit.host_notes && <Field label="Host notes">{visit.host_notes}</Field>}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
