import {
  ActionIcon,
  Button,
  Card,
  Group,
  Pagination,
  Select,
  SimpleGrid,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { INSTITUTION_TYPES, labelize, type AdminInstitution, type Paginated } from '../api/types';

const PAGE_SIZE = 10;

export function InstitutionManagerCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<string | null>('school');
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const params = { q: q || undefined, page, page_size: PAGE_SIZE };
  const { data } = useQuery({
    queryKey: ['admin', 'institutions', params],
    queryFn: () => api.get<Paginated<AdminInstitution>>('/api/admin/institutions', params),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'institutions'] });
    queryClient.invalidateQueries({ queryKey: ['map'] });
  };

  const add = useMutation({
    mutationFn: () =>
      api.post<AdminInstitution>('/api/admin/institutions', {
        name: name.trim(),
        institution_type: type,
        location: location.trim() || undefined,
        city: city.trim() || undefined,
        region: 'Manual',
      }),
    onSuccess: (inst) => {
      invalidate();
      setName('');
      setLocation('');
      setCity('');
      notifications.show({ color: 'green', message: `Added “${inst.name}” to the catalog` });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Could not add institution',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/institutions/${id}`),
    onSuccess: invalidate,
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Could not delete',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  const total = data?.total ?? 0;
  const canAdd = name.trim().length > 0 && !!type && location.trim().length > 0;

  return (
    <Card withBorder p="lg">
      <Title order={3}>Institution catalog</Title>
      <Text size="sm" c="dimmed" mb="md">
        Add institutions the OpenStreetMap importer can’t find (some schools are only mapped as
        a building, so they never import). New entries appear on the Map as coverage targets.
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2 }} mb="xs">
        <TextInput
          label="Name"
          placeholder="L&N STEM Academy"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Select
          label="Type"
          data={INSTITUTION_TYPES.map((t) => ({ value: t, label: labelize(t) }))}
          value={type}
          onChange={setType}
        />
        <TextInput
          label="Location"
          description="Address or place to look up, or a raw “lat, lon”"
          placeholder="401 Henley St, Knoxville TN"
          value={location}
          onChange={(e) => setLocation(e.currentTarget.value)}
        />
        <TextInput
          label="City (optional)"
          placeholder="Knoxville"
          value={city}
          onChange={(e) => setCity(e.currentTarget.value)}
        />
      </SimpleGrid>
      <Group justify="flex-end" mb="lg">
        <Button variant="gradient" loading={add.isPending} disabled={!canAdd} onClick={() => add.mutate()}>
          Add to catalog
        </Button>
      </Group>

      <TextInput
        placeholder="Search catalog by name or city"
        value={q}
        onChange={(e) => {
          setQ(e.currentTarget.value);
          setPage(1);
        }}
        mb="xs"
      />
      <Table.ScrollContainer minWidth={520}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>City</Table.Th>
              <Table.Th>Region</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.items ?? []).map((inst) => (
              <Table.Tr key={inst.id}>
                <Table.Td>{inst.name}</Table.Td>
                <Table.Td>{labelize(inst.institution_type)}</Table.Td>
                <Table.Td>{inst.city ?? '—'}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {inst.region ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Tooltip label="Delete from catalog">
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      loading={remove.isPending && remove.variables === inst.id}
                      onClick={() => {
                        if (window.confirm(`Delete “${inst.name}” from the catalog?`)) {
                          remove.mutate(inst.id);
                        }
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
            {(data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center" py="md">
                    No catalog entries {q ? `match “${q}”` : 'yet'}.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Group justify="space-between" mt="sm">
        <Text size="sm" c="dimmed">
          {total.toLocaleString()} institution{total === 1 ? '' : 's'}
        </Text>
        <Pagination
          size="sm"
          value={page}
          onChange={setPage}
          total={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        />
      </Group>
    </Card>
  );
}
