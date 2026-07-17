import { Badge, Card, Group, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { LANGUAGES, type DirectoryUser, type Paginated } from '../api/types';
import { VenueFilterSelect } from '../components/VenueFilterSelect';

export function DirectoryPage() {
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
        <Title order={2}>Directory</Title>
        <Text c="dimmed" size="sm">
          Fellow communicators — the schools they've attended and the languages they speak.
        </Text>
      </div>

      <Card withBorder p="lg">
        <Group align="flex-end">
          <TextInput
            label="Search"
            placeholder="Name"
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            w={220}
          />
          <VenueFilterSelect value={venueFilter} onChange={setVenueFilter} placeholder="Any school" />
          <Select
            label="Language"
            placeholder="Any"
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
                <Table.Th>Name</Table.Th>
                <Table.Th>Affiliation</Table.Th>
                <Table.Th>Schools</Table.Th>
                <Table.Th>Languages</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.items ?? []).map((member) => (
                <Table.Tr key={member.id}>
                  <Table.Td>{member.name}</Table.Td>
                  <Table.Td>{member.affiliation ?? '—'}</Table.Td>
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
                  <Table.Td colSpan={4}>
                    <Text c="dimmed" ta="center" py="lg">
                      No members match these filters.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Text size="sm" c="dimmed">
        {(data?.total ?? 0).toLocaleString()} member{data?.total === 1 ? '' : 's'}
      </Text>
    </Stack>
  );
}
