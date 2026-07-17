import { Badge, Card, Group, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { LANGUAGES, type DirectoryUser, type Paginated } from '../api/types';
import { VenueFilterSelect } from '../components/VenueFilterSelect';

export function DirectoryPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [venueFilter, setVenueFilter] = useState<number | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);

  const params = {
    q: q || undefined,
    venue_id: venueFilter ?? undefined,
    language: languageFilter ?? undefined,
    page_size: 100,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['users', 'directory', params],
    queryFn: () => api.get<Paginated<DirectoryUser>>('/api/users/directory', params),
  });

  return (
    <Stack>
      <div>
        <Title order={2}>{t('directory.title')}</Title>
        <Text c="dimmed" size="sm">
          {t('directory.subtitle')}
        </Text>
      </div>

      <Card withBorder p="lg">
        <Group align="flex-end">
          <TextInput
            label={t('directory.searchLabel')}
            placeholder={t('directory.namePlaceholder')}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            w={220}
          />
          <VenueFilterSelect
            value={venueFilter}
            onChange={setVenueFilter}
            placeholder={t('directory.anySchoolPlaceholder')}
          />
          <Select
            label={t('directory.languageLabel')}
            placeholder={t('common.any')}
            searchable
            clearable
            data={LANGUAGES}
            value={languageFilter}
            onChange={setLanguageFilter}
            w={200}
          />
        </Group>
      </Card>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={640}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('directory.colName')}</Table.Th>
                <Table.Th>{t('directory.colAffiliation')}</Table.Th>
                <Table.Th>{t('directory.colPosition')}</Table.Th>
                <Table.Th>{t('directory.colSchools')}</Table.Th>
                <Table.Th>{t('directory.colLanguages')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.items ?? []).map((member) => (
                <Table.Tr key={member.id}>
                  <Table.Td>{member.name}</Table.Td>
                  <Table.Td>{member.affiliation ?? '—'}</Table.Td>
                  <Table.Td>{member.position ?? '—'}</Table.Td>
                  <Table.Td>
                    {member.schools.length > 0 ? (
                      <Group gap={4}>
                        {member.schools.map((s) => (
                          <Badge key={s.id} size="xs" variant="light">
                            {s.name}
                          </Badge>
                        ))}
                      </Group>
                    ) : (
                      '—'
                    )}
                  </Table.Td>
                  <Table.Td>
                    {member.languages_spoken.length > 0 ? member.languages_spoken.join(', ') : '—'}
                  </Table.Td>
                </Table.Tr>
              ))}
              {!isLoading && (data?.items.length ?? 0) === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" py="lg">
                      {t('directory.noMembersMatch')}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Text size="sm" c="dimmed">
        {t('directory.memberCount', {
          count: data?.total ?? 0,
          formattedCount: (data?.total ?? 0).toLocaleString(),
        })}
      </Text>
    </Stack>
  );
}
