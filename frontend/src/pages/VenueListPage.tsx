import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBuildingCommunity } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { VENUE_TYPES, type Paginated, type VenueListItem } from '../api/types';
import { ConnectionFormModal } from '../components/ConnectionFormModal';
import { EmptyState } from '../components/EmptyState';
import { VenueFormModal } from '../components/VenuePicker';
import { useEnumLabel } from '../i18n/enumLabels';

const PAGE_SIZE = 25;

export function VenueListPage() {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [venueType, setVenueType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [creating, create] = useDisclosure(false);
  const [addingConnection, connectionActions] = useDisclosure(false);

  const params = {
    q: q || undefined,
    venue_type: venueType ?? undefined,
    page,
    page_size: PAGE_SIZE,
  };
  const { data } = useQuery({
    queryKey: ['venues', 'list', params],
    queryFn: () => api.get<Paginated<VenueListItem>>('/api/venues', params),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('venueList.title')}</Title>
        <Group>
          <Button variant="default" onClick={connectionActions.open}>
            {t('venueList.addConnection')}
          </Button>
          <Button variant="gradient" onClick={create.open}>
            {t('venueList.addVenue')}
          </Button>
        </Group>
      </Group>

      <Card withBorder p="md">
        <Group align="flex-end">
          <TextInput
            label={t('venueList.searchLabel')}
            placeholder={t('venueList.searchPlaceholder')}
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
            w={280}
          />
          <Select
            label={t('venueList.typeLabel')}
            placeholder={t('common.all')}
            clearable
            data={VENUE_TYPES.map((vt) => ({ value: vt, label: enumLabel.venueType(vt) }))}
            value={venueType}
            onChange={(v) => {
              setVenueType(v);
              setPage(1);
            }}
          />
        </Group>
      </Card>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={620}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('venueList.colName')}</Table.Th>
              <Table.Th>{t('venueList.colType')}</Table.Th>
              <Table.Th>{t('venueList.colCity')}</Table.Th>
              <Table.Th>{t('venueList.colState')}</Table.Th>
              <Table.Th ta="right">{t('venueList.colVisits')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.items ?? []).map((venue) => (
              <Table.Tr
                key={venue.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/venues/${venue.id}`)}
              >
                <Table.Td>
                  <Anchor component={Link} to={`/venues/${venue.id}`} onClick={(e) => e.stopPropagation()}>
                    {venue.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{enumLabel.venueType(venue.venue_type)}</Badge>
                </Table.Td>
                <Table.Td>{venue.city ?? '—'}</Table.Td>
                <Table.Td>{venue.state ?? '—'}</Table.Td>
                <Table.Td ta="right" className="tabular-nums">
                  {venue.visit_count}
                </Table.Td>
              </Table.Tr>
            ))}
            {(data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5} p={0}>
                  <EmptyState
                    icon={IconBuildingCommunity}
                    title={t('venueList.emptyTitle')}
                    description={t('venueList.emptyDescription')}
                    actionLabel={t('venueList.addVenue')}
                    onAction={create.open}
                  />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
        </Table.ScrollContainer>
      </Card>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {data
            ? t('venueList.venueCount', {
                count: data.total,
                formattedCount: data.total.toLocaleString(),
              })
            : ''}
        </Text>
        <Pagination
          value={page}
          onChange={setPage}
          total={Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))}
        />
      </Group>

      <VenueFormModal
        opened={creating}
        onClose={create.close}
        onSaved={(venue) => {
          queryClient.invalidateQueries({ queryKey: ['venues'] });
          create.close();
          navigate(`/venues/${venue.id}`);
        }}
      />

      <ConnectionFormModal
        opened={addingConnection}
        onClose={connectionActions.close}
        onSaved={(connection) => {
          queryClient.invalidateQueries({ queryKey: ['venues'] });
          queryClient.invalidateQueries({
            queryKey: ['connections', { venue_id: String(connection.venue_id) }],
          });
          connectionActions.close();
          navigate(`/venues/${connection.venue_id}`);
        }}
      />
    </Stack>
  );
}
