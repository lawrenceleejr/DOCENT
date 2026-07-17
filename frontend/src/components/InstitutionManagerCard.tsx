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
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { INSTITUTION_TYPES, type AdminInstitution, type Paginated } from '../api/types';
import { useEnumLabel } from '../i18n/enumLabels';

const PAGE_SIZE = 10;

export function InstitutionManagerCard() {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
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
      notifications.show({
        color: 'green',
        message: t('institutionManagerCard.addedMessage', { name: inst.name }),
      });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('institutionManagerCard.addErrorTitle'),
        message: e instanceof ApiError ? e.message : t('institutionManagerCard.unexpectedError'),
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/institutions/${id}`),
    onSuccess: invalidate,
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('institutionManagerCard.deleteErrorTitle'),
        message: e instanceof ApiError ? e.message : t('institutionManagerCard.unexpectedError'),
      });
    },
  });

  const total = data?.total ?? 0;
  const canAdd = name.trim().length > 0 && !!type && location.trim().length > 0;

  return (
    <Card withBorder p="lg">
      <Title order={3}>{t('institutionManagerCard.title')}</Title>
      <Text size="sm" c="dimmed" mb="md">
        {t('institutionManagerCard.description')}
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2 }} mb="xs">
        <TextInput
          label={t('institutionManagerCard.nameLabel')}
          placeholder={t('institutionManagerCard.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Select
          label={t('institutionManagerCard.typeLabel')}
          data={INSTITUTION_TYPES.map((v) => ({ value: v, label: enumLabel.institutionType(v) }))}
          value={type}
          onChange={setType}
        />
        <TextInput
          label={t('institutionManagerCard.locationLabel')}
          description={t('institutionManagerCard.locationDescription')}
          placeholder={t('institutionManagerCard.locationPlaceholder')}
          value={location}
          onChange={(e) => setLocation(e.currentTarget.value)}
        />
        <TextInput
          label={t('institutionManagerCard.cityLabel')}
          placeholder={t('institutionManagerCard.cityPlaceholder')}
          value={city}
          onChange={(e) => setCity(e.currentTarget.value)}
        />
      </SimpleGrid>
      <Group justify="flex-end" mb="lg">
        <Button variant="gradient" loading={add.isPending} disabled={!canAdd} onClick={() => add.mutate()}>
          {t('institutionManagerCard.addButton')}
        </Button>
      </Group>

      <TextInput
        placeholder={t('institutionManagerCard.searchPlaceholder')}
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
              <Table.Th>{t('institutionManagerCard.colName')}</Table.Th>
              <Table.Th>{t('institutionManagerCard.colType')}</Table.Th>
              <Table.Th>{t('institutionManagerCard.colCity')}</Table.Th>
              <Table.Th>{t('institutionManagerCard.colRegion')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.items ?? []).map((inst) => (
              <Table.Tr key={inst.id}>
                <Table.Td>{inst.name}</Table.Td>
                <Table.Td>{enumLabel.institutionType(inst.institution_type)}</Table.Td>
                <Table.Td>{inst.city ?? '—'}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {inst.region ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Tooltip label={t('institutionManagerCard.deleteTooltip')}>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      loading={remove.isPending && remove.variables === inst.id}
                      onClick={() => {
                        if (window.confirm(t('institutionManagerCard.deleteConfirm', { name: inst.name }))) {
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
                    {q
                      ? t('institutionManagerCard.emptyMatch', { q })
                      : t('institutionManagerCard.emptyYet')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Group justify="space-between" mt="sm">
        <Text size="sm" c="dimmed">
          {t('institutionManagerCard.institutionCount', {
            count: total,
            formattedCount: total.toLocaleString(),
          })}
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
