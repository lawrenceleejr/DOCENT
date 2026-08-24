import {
  Anchor,
  Badge,
  Card,
  Group,
  MultiSelect,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { LANGUAGES, type DirectoryUserList } from '../api/types';
import { OrcidLink } from '../components/OrcidLink';
import { VenueFilterSelect } from '../components/VenueFilterSelect';

type SortField = 'name' | 'affiliation' | 'position' | 'orcid';

/** A column header that cycles ascending → descending on click, showing the
 * current direction (server-side sort — see /api/users/directory). */
function SortableTh({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: SortField;
  sort: string;
  onSort: (field: SortField) => void;
}) {
  const active = sort === field || sort === `-${field}`;
  const Icon = !active ? IconSelector : sort === field ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th>
      <UnstyledButton onClick={() => onSort(field)}>
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={700}>
            {label}
          </Text>
          <Icon size={14} stroke={1.5} />
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

export function DirectoryPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [venueFilter, setVenueFilter] = useState<number | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState<string[]>([]);
  const [institutionFilter, setInstitutionFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<string>('name');

  const toggleSort = (field: SortField) =>
    setSort((current) => (current === field ? `-${field}` : field));

  const params = {
    q: q || undefined,
    venue_id: venueFilter ?? undefined,
    language: languageFilter ?? undefined,
    position: positionFilter.length ? positionFilter : undefined,
    institution: institutionFilter.length ? institutionFilter : undefined,
    sort,
    page_size: 100,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['users', 'directory', params],
    queryFn: () => api.get<DirectoryUserList>('/api/users/directory', params),
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
            placeholder={t('directory.searchAllPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            w={220}
          />
          <MultiSelect
            label={t('directory.positionLabel')}
            placeholder={positionFilter.length ? undefined : t('directory.anyPositionPlaceholder')}
            searchable
            clearable
            data={data?.positions ?? []}
            value={positionFilter}
            onChange={setPositionFilter}
            w={220}
          />
          <MultiSelect
            label={t('directory.institutionLabel')}
            placeholder={
              institutionFilter.length ? undefined : t('directory.anyInstitutionPlaceholder')
            }
            searchable
            clearable
            data={data?.institutions ?? []}
            value={institutionFilter}
            onChange={setInstitutionFilter}
            w={240}
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
                <SortableTh
                  label={t('directory.colName')}
                  field="name"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortableTh
                  label={t('directory.colAffiliation')}
                  field="affiliation"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortableTh
                  label={t('directory.colPosition')}
                  field="position"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortableTh
                  label={t('directory.colOrcid')}
                  field="orcid"
                  sort={sort}
                  onSort={toggleSort}
                />
                <Table.Th>{t('directory.colSchools')}</Table.Th>
                <Table.Th>{t('directory.colLanguages')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.items ?? []).map((member) => (
                <Table.Tr key={member.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/directory/${member.id}`}>
                      {member.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{member.affiliation ?? '—'}</Table.Td>
                  <Table.Td>{member.position ?? '—'}</Table.Td>
                  <Table.Td>
                    {member.orcid ? <OrcidLink orcid={member.orcid} /> : '—'}
                  </Table.Td>
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
                  <Table.Td colSpan={6}>
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
