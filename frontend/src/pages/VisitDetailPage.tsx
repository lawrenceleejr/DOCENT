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
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { isOverdue, type Visit } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useEnumLabel } from '../i18n/enumLabels';

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
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
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
      notifications.show({ message: t('visitDetail.deleteSuccess') });
      navigate('/');
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('visitDetail.couldNotDelete'),
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
              {isOverdue(visit) ? t('visitList.overdue') : enumLabel.visitStatus(visit.status)}
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
                {t('visitDetail.markCompleted')}
              </Button>
            )}
            <Button variant="default" onClick={() => navigate(`/visits/${visit.id}/edit`)}>
              {t('common.edit')}
            </Button>
            <Button
              color="red"
              variant="light"
              loading={remove.isPending}
              onClick={() => {
                if (window.confirm(t('visitDetail.deleteConfirm'))) {
                  remove.mutate();
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </Group>
        )}
      </Group>

      <Card withBorder p="lg">
        <Stack gap="md">
          <Group grow>
            <Field label={t('visitDetail.fieldCommunicator')}>{visit.author.name}</Field>
            <Field label={t('visitDetail.fieldEventType')}>
              <Badge variant="light">{enumLabel.eventType(visit.event_type)}</Badge>
            </Field>
            <Field label={t('visitDetail.fieldAudience')}>
              <Badge variant="light">{enumLabel.audienceLevel(visit.audience_level)}</Badge>
            </Field>
            {visit.language && (
              <Field label={t('visitDetail.fieldLanguage')}>{visit.language}</Field>
            )}
          </Group>
          <Group grow>
            <Field label={t('visitDetail.fieldPeopleReached')}>
              {visit.people_reached.toLocaleString()}
            </Field>
            <Field label={t('visitDetail.fieldDuration')}>
              {visit.duration_minutes ? `${visit.duration_minutes} ${t('visitDetail.minSuffix')}` : '—'}
            </Field>
            <Field label={t('visitDetail.fieldFollowUp')}>
              {visit.follow_up_planned ? t('common.yes') : t('common.no')}
            </Field>
          </Group>
          {visit.rating !== null && (
            <Field label={t('visitDetail.fieldHowItWent')}>
              <Rating value={visit.rating} readOnly />
            </Field>
          )}
          {visit.description && (
            <Field label={t('visitDetail.fieldDescription')}>{visit.description}</Field>
          )}
          {visit.reflection && (
            <Field label={t('visitDetail.fieldReflection')}>{visit.reflection}</Field>
          )}
          {visit.additional_presenters && (
            <Field label={t('visitDetail.fieldAdditionalPresenters')}>
              {visit.additional_presenters}
            </Field>
          )}
          {visit.tags.length > 0 && (
            <Field label={t('visitDetail.fieldTags')}>
              <Group gap={6}>
                {visit.tags.map((tag) => (
                  <Badge key={tag} variant="light" color="grape">
                    {tag}
                  </Badge>
                ))}
              </Group>
            </Field>
          )}
          {visit.links.length > 0 && (
            <Field label={t('visitDetail.fieldCoverageLinks')}>
              <Stack gap={6}>
                {visit.links.map((lk, i) => (
                  <Group key={i} gap={8} wrap="nowrap">
                    <Badge variant="light" color="blue" size="sm" style={{ flexShrink: 0 }}>
                      {enumLabel.coverageCategory(lk.category)}
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
              <Divider label={t('visitDetail.hostDivider')} labelPosition="left" />
              <Group grow>
                {visit.contact_name && (
                  <Field label={t('visitDetail.fieldName')}>{visit.contact_name}</Field>
                )}
                {visit.host_role && (
                  <Field label={t('visitDetail.fieldRole')}>{visit.host_role}</Field>
                )}
                {(visit.host_relationship || visit.host_relationship_detail) && (
                  <Field label={t('visitDetail.fieldRelationship')}>
                    {[
                      visit.host_relationship ? enumLabel.hostRelationship(visit.host_relationship) : null,
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
                    <Field label={t('visitDetail.fieldEmail')}>
                      <Anchor href={`mailto:${visit.contact_email}`}>{visit.contact_email}</Anchor>
                    </Field>
                  )}
                  {visit.contact_phone && (
                    <Field label={t('visitDetail.fieldPhone')}>{visit.contact_phone}</Field>
                  )}
                </Group>
              )}
              {visit.host_notes && (
                <Field label={t('visitDetail.fieldHostNotes')}>{visit.host_notes}</Field>
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
