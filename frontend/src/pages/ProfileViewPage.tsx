import { Anchor, Badge, Card, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { UserProfile } from '../api/types';
import { OrcidLink } from '../components/OrcidLink';
import { useEnumLabel } from '../i18n/enumLabels';

export function ProfileViewPage() {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const { userId } = useParams();

  const { data: profile } = useQuery({
    queryKey: ['users', userId, 'profile'],
    queryFn: () => api.get<UserProfile>(`/api/users/${userId}/profile`),
    enabled: !!userId,
  });

  if (!profile) return null;

  const subtitle = [profile.position, profile.affiliation].filter(Boolean).join(' · ');

  return (
    <Stack maw={900} mx="auto">
      <div>
        <Title order={2}>{profile.name}</Title>
        {subtitle && (
          <Text c="dimmed" size="sm">
            {subtitle}
          </Text>
        )}
        {profile.orcid && (
          <Text size="sm" mt={4}>
            <OrcidLink orcid={profile.orcid} />
          </Text>
        )}
        {profile.roles.length > 0 && (
          <Group gap={6} mt={8}>
            {profile.roles.map((role, i) => (
              <Badge key={i} variant="light" color="gray" size="lg">
                {role.title}
                {role.organization ? ` · ${role.organization}` : ''}
              </Badge>
            ))}
          </Group>
        )}
      </div>

      <SimpleGrid cols={{ base: 2 }} maw={360}>
        <Card withBorder p="md">
          <Text size="xl" fw={700} className="tabular-nums">
            {profile.total_visits.toLocaleString()}
          </Text>
          <Text size="sm" c="dimmed">
            {t('profileView.totalVisits')}
          </Text>
        </Card>
        <Card withBorder p="md">
          <Text size="xl" fw={700} className="tabular-nums">
            {profile.total_people_reached.toLocaleString()}
          </Text>
          <Text size="sm" c="dimmed">
            {t('profileView.peopleReached')}
          </Text>
        </Card>
      </SimpleGrid>

      {(profile.languages_spoken.length > 0 || profile.schools.length > 0) && (
        <Card withBorder p="md">
          <Stack gap="sm">
            {profile.languages_spoken.length > 0 && (
              <div>
                <Text size="sm" fw={600}>
                  {t('profileView.languages')}
                </Text>
                <Text size="sm">{profile.languages_spoken.join(', ')}</Text>
              </div>
            )}
            {profile.schools.length > 0 && (
              <div>
                <Text size="sm" fw={600} mb={4}>
                  {t('profileView.schools')}
                </Text>
                <Group gap={6}>
                  {profile.schools.map((s) => (
                    <Badge key={s.id} variant="light">
                      {s.name}
                    </Badge>
                  ))}
                </Group>
              </div>
            )}
          </Stack>
        </Card>
      )}

      <Title order={3} mt="sm">
        {t('profileView.eventsTitle')}
      </Title>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={640}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('profileView.colDate')}</Table.Th>
                <Table.Th>{t('profileView.colTitle')}</Table.Th>
                <Table.Th>{t('profileView.colVenue')}</Table.Th>
                <Table.Th>{t('profileView.colType')}</Table.Th>
                <Table.Th ta="right">{t('profileView.colPeople')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {profile.visits.map((v) => (
                <Table.Tr key={v.id}>
                  <Table.Td>{v.visit_date}</Table.Td>
                  <Table.Td>
                    <Anchor component={Link} to={`/visits/${v.id}`}>
                      {v.title}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    {v.venue_name}
                    {v.venue_city ? `, ${v.venue_city}` : ''}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{enumLabel.eventType(v.event_type)}</Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="tabular-nums">
                    {v.people_reached.toLocaleString()}
                  </Table.Td>
                </Table.Tr>
              ))}
              {profile.visits.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" py="lg">
                      {t('profileView.noEvents')}
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
