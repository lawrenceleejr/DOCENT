import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconChevronUp, IconPencil, IconTrash, IconUserPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  type Connection,
  type HostRelationship,
  type Paginated,
  type VenueDetail,
  type VenueListItem,
  type Visit,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ConnectionFormModal } from '../components/ConnectionFormModal';
import { VenueFormModal } from '../components/VenuePicker';
import { useEnumLabel } from '../i18n/enumLabels';

interface ContactRow {
  key: string;
  name: string;
  role: string | null;
  relationshipType: HostRelationship | null;
  relationshipDetail: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  connection: Connection | null;
  visitCount: number;
  lastVisit: { id: number; date: string } | null;
}

type SortField = 'name' | 'role' | 'relationship' | 'email' | 'visits';

function buildContactRows(visits: Visit[], connections: Connection[]): ContactRow[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const groups = new Map<string, ContactRow>();

  // Seed from visit host contacts, oldest first so the most recent visit's
  // details win when the same person hosted more than once.
  const hostVisits = visits
    .filter((v) => v.contact_name && v.contact_name.trim())
    .slice()
    .sort((a, b) => a.visit_date.localeCompare(b.visit_date));
  for (const v of hostVisits) {
    const key = norm(v.contact_name!);
    const existing = groups.get(key);
    groups.set(key, {
      key,
      name: v.contact_name!,
      role: v.host_role,
      relationshipType: v.host_relationship,
      relationshipDetail: v.host_relationship_detail,
      email: v.contact_email,
      phone: v.contact_phone,
      notes: v.host_notes,
      connection: existing?.connection ?? null,
      visitCount: (existing?.visitCount ?? 0) + 1,
      lastVisit: { id: v.id, date: v.visit_date },
    });
  }

  // Overlay tracked connections — the deliberately-maintained record wins
  // for the displayed fields, but past-visit history is preserved.
  for (const c of connections) {
    const key = norm(c.name);
    const existing = groups.get(key);
    groups.set(key, {
      key,
      name: c.name,
      role: c.role,
      relationshipType: c.relationship_type,
      relationshipDetail: c.relationship_detail,
      email: c.email,
      phone: c.phone,
      notes: c.notes,
      connection: c,
      visitCount: existing?.visitCount ?? 0,
      lastVisit: existing?.lastVisit ?? null,
    });
  }

  return [...groups.values()];
}

type ModalState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'track'; row: ContactRow }
  | { mode: 'edit'; connection: Connection };

function MergeVenueModal({
  targetId,
  targetName,
  opened,
  onClose,
  onMerged,
}: {
  targetId: number;
  targetName: string;
  opened: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const { data } = useQuery({
    queryKey: ['venues', 'mergepick', q],
    queryFn: () => api.get<Paginated<VenueListItem>>('/api/venues', { q: q || undefined, page_size: 20 }),
    enabled: opened,
  });

  const merge = useMutation({
    mutationFn: () =>
      api.post(`/api/venues/${targetId}/merge`, { from_ids: selected }),
    onSuccess: () => {
      onMerged();
      onClose();
      setSelected([]);
      setQ('');
      notifications.show({ color: 'green', message: t('venueDetail.mergeSuccess') });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('venueDetail.mergeFailedTitle'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  const candidates = (data?.items ?? []).filter((v) => v.id !== targetId);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('venueDetail.mergeModalTitle', { name: targetName })}
      size="md"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          <Trans
            i18nKey="venueDetail.mergeDescription"
            values={{ name: targetName }}
            components={{ bold: <b /> }}
          />
        </Text>
        <TextInput
          placeholder={t('venueDetail.mergeSearchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        <Stack gap={4} mah={300} style={{ overflowY: 'auto' }}>
          {candidates.map((v) => (
            <Checkbox
              key={v.id}
              label={`${v.name}${v.city ? `, ${v.city}` : ''} · ${t('venueDetail.mergeCandidateVisitCount', { count: v.visit_count, formattedCount: v.visit_count.toLocaleString() })}`}
              checked={selected.includes(v.id)}
              onChange={(e) =>
                setSelected((cur) =>
                  e.currentTarget.checked ? [...cur, v.id] : cur.filter((x) => x !== v.id),
                )
              }
            />
          ))}
          {candidates.length === 0 && (
            <Text size="sm" c="dimmed" py="sm" ta="center">
              {t('venueDetail.mergeNoCandidates')}
            </Text>
          )}
        </Stack>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            color="red"
            loading={merge.isPending}
            disabled={selected.length === 0}
            onClick={() => merge.mutate()}
          >
            {t('venueDetail.mergeButton', {
              count: selected.length,
              formattedCount: selected.length.toLocaleString(),
            })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function VenueDetailPage() {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, edit] = useDisclosure(false);
  const [merging, merge] = useDisclosure(false);

  const { data: venue } = useQuery({
    queryKey: ['venues', id],
    queryFn: () => api.get<VenueDetail>(`/api/venues/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/venues/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] });
      notifications.show({ message: t('venueDetail.deleteSuccess') });
      navigate('/venues');
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('venueDetail.deleteFailedTitle'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });
  const { data: visits } = useQuery({
    queryKey: ['visits', { venue_id: id }],
    queryFn: () =>
      api.get<Paginated<Visit>>('/api/visits', { venue_id: id, page_size: 100 }),
  });
  const { data: connections } = useQuery({
    queryKey: ['connections', { venue_id: id }],
    queryFn: () => api.get<Connection[]>('/api/connections', { venue_id: id }),
  });

  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [sort, setSort] = useState<{ field: SortField; dir: 1 | -1 }>({
    field: 'name',
    dir: 1,
  });

  const contactRows = useMemo(
    () => buildContactRows(visits?.items ?? [], connections ?? []),
    [visits, connections],
  );

  const sortedContacts = useMemo(() => {
    const { field, dir } = sort;
    const val = (row: ContactRow): string | number => {
      switch (field) {
        case 'name':
          return row.name.toLowerCase();
        case 'role':
          return (row.role ?? '').toLowerCase();
        case 'relationship':
          return row.relationshipType ? enumLabel.hostRelationship(row.relationshipType) : '';
        case 'email':
          return (row.email ?? '').toLowerCase();
        case 'visits':
          return row.visitCount;
      }
    };
    return [...contactRows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [contactRows, sort, enumLabel]);

  const toggleSort = (field: SortField) =>
    setSort((cur) => (cur.field === field ? { field, dir: (cur.dir * -1) as 1 | -1 } : { field, dir: 1 }));

  const sortIcon = (field: SortField) =>
    sort.field === field ? (
      sort.dir === 1 ? (
        <IconChevronUp size={14} />
      ) : (
        <IconChevronDown size={14} />
      )
    ) : null;

  if (!venue) return null;

  const address = [venue.address, venue.city, venue.state, venue.country]
    .filter(Boolean)
    .join(', ');
  const canManage = user && (user.id === venue.created_by_id || user.is_admin);

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{venue.name}</Title>
            <Badge variant="light" size="lg">
              {enumLabel.venueType(venue.venue_type)}
            </Badge>
          </Group>
          <Text c="dimmed">{address || t('venueDetail.noAddress')}</Text>
        </div>
        {canManage && (
          <Group>
            {user?.is_admin && (
              <Button variant="default" onClick={merge.open}>
                {t('venueDetail.mergeDuplicates')}
              </Button>
            )}
            <Button variant="default" onClick={edit.open}>
              {t('common.edit')}
            </Button>
            <Button
              color="red"
              variant="light"
              loading={remove.isPending}
              onClick={() => {
                if (venue.visit_count > 0) {
                  notifications.show({
                    color: 'red',
                    title: t('venueDetail.cannotDeleteTitle'),
                    message: t('venueDetail.cannotDeleteMessage', {
                      count: venue.visit_count,
                      formattedCount: venue.visit_count.toLocaleString(),
                    }),
                  });
                  return;
                }
                if (window.confirm(t('venueDetail.deleteConfirm'))) {
                  remove.mutate();
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </Group>
        )}
      </Group>

      <Group>
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('venueDetail.totalVisits')}
          </Text>
          <Text fz={28} fw={700}>
            {venue.visit_count}
          </Text>
        </Card>
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('venueDetail.lastVisit')}
          </Text>
          <Text fz={28} fw={700}>
            {venue.last_visit_date ?? '—'}
          </Text>
        </Card>
      </Group>

      {venue.notes && (
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('venueDetail.notes')}
          </Text>
          <Text>{venue.notes}</Text>
        </Card>
      )}

      <Group justify="space-between" align="center">
        <Title order={3}>{t('venueDetail.contacts')}</Title>
        <Button
          variant="default"
          leftSection={<IconUserPlus size={16} />}
          onClick={() => setModalState({ mode: 'add' })}
        >
          {t('venueDetail.addConnection')}
        </Button>
      </Group>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={760}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                  <Group gap={4} wrap="nowrap">
                    {t('venueDetail.colName')} {sortIcon('name')}
                  </Group>
                </Table.Th>
                <Table.Th style={{ cursor: 'pointer' }} onClick={() => toggleSort('role')}>
                  <Group gap={4} wrap="nowrap">
                    {t('venueDetail.colRole')} {sortIcon('role')}
                  </Group>
                </Table.Th>
                <Table.Th
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleSort('relationship')}
                >
                  <Group gap={4} wrap="nowrap">
                    {t('venueDetail.colRelationship')} {sortIcon('relationship')}
                  </Group>
                </Table.Th>
                <Table.Th style={{ cursor: 'pointer' }} onClick={() => toggleSort('email')}>
                  <Group gap={4} wrap="nowrap">
                    {t('venueDetail.colEmail')} {sortIcon('email')}
                  </Group>
                </Table.Th>
                <Table.Th
                  ta="right"
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleSort('visits')}
                >
                  <Group gap={4} wrap="nowrap" justify="flex-end">
                    {t('venueDetail.colVisits')} {sortIcon('visits')}
                  </Group>
                </Table.Th>
                <Table.Th>{t('venueDetail.colAddedBy')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedContacts.map((row) => {
                const canManageConnection =
                  row.connection &&
                  user &&
                  (user.id === row.connection.added_by?.id || user.is_admin);
                return (
                  <Table.Tr key={row.key}>
                    <Table.Td>
                      <Text fw={600}>{row.name}</Text>
                      {row.notes && (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {row.notes}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{row.role ?? '—'}</Table.Td>
                    <Table.Td>
                      {row.relationshipType ? (
                        <Badge variant="light">{enumLabel.hostRelationship(row.relationshipType)}</Badge>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>
                      {row.email ? (
                        <Anchor href={`mailto:${row.email}`} size="sm">
                          {row.email}
                        </Anchor>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      {row.visitCount > 0 && row.lastVisit ? (
                        <Anchor
                          component={Link}
                          to={`/visits/${row.lastVisit.id}`}
                          size="sm"
                        >
                          {row.visitCount} · {row.lastVisit.date}
                        </Anchor>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>{row.connection?.added_by?.name ?? '—'}</Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        {row.connection ? (
                          canManageConnection && (
                            <>
                              <Tooltip label={t('venueDetail.editConnectionTooltip')}>
                                <ActionIcon
                                  variant="subtle"
                                  onClick={() =>
                                    setModalState({ mode: 'edit', connection: row.connection! })
                                  }
                                >
                                  <IconPencil size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label={t('venueDetail.deleteConnectionTooltip')}>
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        t('venueDetail.removeConnectionConfirm', { name: row.name }),
                                      )
                                    ) {
                                      api
                                        .delete(`/api/connections/${row.connection!.id}`)
                                        .then(() => {
                                          queryClient.invalidateQueries({
                                            queryKey: ['connections', { venue_id: id }],
                                          });
                                          notifications.show({
                                            message: t('venueDetail.connectionRemoved'),
                                          });
                                        })
                                        .catch((e) =>
                                          notifications.show({
                                            color: 'red',
                                            title: t('venueDetail.removeConnectionFailedTitle'),
                                            message:
                                              e instanceof ApiError
                                                ? e.message
                                                : t('common.unexpectedError'),
                                          }),
                                        );
                                    }
                                  }}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </>
                          )
                        ) : (
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => setModalState({ mode: 'track', row })}
                          >
                            {t('venueDetail.trackButton')}
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {sortedContacts.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="lg">
                      {t('venueDetail.noContacts')}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Title order={3}>{t('venueDetail.visitHistory')}</Title>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={640}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('venueDetail.colDate')}</Table.Th>
              <Table.Th>{t('venueDetail.colVisitTitle')}</Table.Th>
              <Table.Th>{t('venueDetail.colCommunicator')}</Table.Th>
              <Table.Th>{t('venueDetail.colAudience')}</Table.Th>
              <Table.Th ta="right">{t('venueDetail.colPeopleReached')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(visits?.items ?? []).map((visit) => (
              <Table.Tr
                key={visit.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/visits/${visit.id}`)}
              >
                <Table.Td>{visit.visit_date}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/visits/${visit.id}`} onClick={(e) => e.stopPropagation()}>
                    {visit.title}
                  </Anchor>
                </Table.Td>
                <Table.Td>{visit.author.name}</Table.Td>
                <Table.Td>{enumLabel.audienceLevel(visit.audience_level)}</Table.Td>
                <Table.Td ta="right">{visit.people_reached.toLocaleString()}</Table.Td>
              </Table.Tr>
            ))}
            {(visits?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center" py="lg">
                    {t('venueDetail.noVisits')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
        </Table.ScrollContainer>
      </Card>

      <VenueFormModal
        opened={editing}
        onClose={edit.close}
        venue={venue}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['venues'] });
          edit.close();
        }}
      />

      <MergeVenueModal
        opened={merging}
        onClose={merge.close}
        targetId={venue.id}
        targetName={venue.name}
        onMerged={() => {
          queryClient.invalidateQueries({ queryKey: ['venues'] });
          queryClient.invalidateQueries({ queryKey: ['visits'] });
        }}
      />

      <ConnectionFormModal
        key={
          modalState.mode === 'edit'
            ? `edit-${modalState.connection.id}`
            : modalState.mode === 'track'
              ? `track-${modalState.row.key}`
              : modalState.mode
        }
        opened={modalState.mode !== 'closed'}
        onClose={() => setModalState({ mode: 'closed' })}
        venueId={venue.id}
        venueName={venue.name}
        connection={modalState.mode === 'edit' ? modalState.connection : undefined}
        initial={
          modalState.mode === 'track'
            ? {
                name: modalState.row.name,
                role: modalState.row.role,
                relationship_type: modalState.row.relationshipType,
                relationship_detail: modalState.row.relationshipDetail,
                email: modalState.row.email,
                phone: modalState.row.phone,
              }
            : undefined
        }
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['connections', { venue_id: id }] });
          notifications.show({
            message:
              modalState.mode === 'edit'
                ? t('venueDetail.connectionUpdated')
                : t('venueDetail.connectionAdded'),
            color: 'green',
          });
          setModalState({ mode: 'closed' });
        }}
      />
    </Stack>
  );
}
