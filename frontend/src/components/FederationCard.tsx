import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import {
  FEDERATION_INTERVALS,
  type FederationInterval,
  type FederationPeer,
  type RegistrationSettings,
} from '../api/types';

export function FederationCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<RegistrationSettings>('/api/admin/settings'),
  });

  const { data: peers } = useQuery({
    queryKey: ['admin', 'federation', 'peers'],
    queryFn: () => api.get<FederationPeer[]>('/api/admin/federation/peers'),
  });

  const [feedUrl, setFeedUrl] = useState('');
  const [interval, setInterval] = useState<FederationInterval>('day');

  const intervalOptions = FEDERATION_INTERVALS.map((v) => ({
    value: v,
    label: t(`federationCard.interval_${v}`),
  }));

  const invalidatePeers = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'federation', 'peers'] });
  };
  const invalidateMerged = () => {
    queryClient.invalidateQueries({ queryKey: ['visits'] });
    queryClient.invalidateQueries({ queryKey: ['map'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };
  const showError = (e: unknown) => {
    notifications.show({
      color: 'red',
      title: t('federationCard.couldNotSave'),
      message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
    });
  };

  // --- Section 1: publishing ---

  const setPublish = useMutation({
    mutationFn: (value: boolean) =>
      api.patch<RegistrationSettings>('/api/admin/settings', { federation_publish: value }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['auth', 'config'] });
      notifications.show({ color: 'green', message: t('federationCard.saved') });
    },
    onError: showError,
  });

  const rotate = useMutation({
    mutationFn: () =>
      api.post<RegistrationSettings>('/api/admin/federation/rotate-token'),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['auth', 'config'] });
      notifications.show({ color: 'green', message: t('federationCard.tokenRotated') });
    },
    onError: showError,
  });

  // --- Section 2: peers ---

  const add = useMutation({
    mutationFn: () =>
      api.post<FederationPeer>('/api/admin/federation/peers', {
        feed_url: feedUrl.trim(),
        interval,
      }),
    onSuccess: () => {
      setFeedUrl('');
      setInterval('day');
      invalidatePeers();
      invalidateMerged();
      notifications.show({ color: 'green', message: t('federationCard.added') });
    },
    onError: showError,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: { label?: string; interval?: FederationInterval; enabled?: boolean };
    }) => api.patch<FederationPeer>(`/api/admin/federation/peers/${id}`, patch),
    onSuccess: invalidatePeers,
    onError: showError,
  });

  const syncOne = useMutation({
    mutationFn: (id: number) =>
      api.post<FederationPeer>(`/api/admin/federation/peers/${id}/sync`),
    onSuccess: () => {
      invalidatePeers();
      invalidateMerged();
      notifications.show({ color: 'green', message: t('federationCard.synced') });
    },
    onError: showError,
  });

  const syncAll = useMutation({
    mutationFn: () => api.post<FederationPeer[]>('/api/admin/federation/sync'),
    onSuccess: () => {
      invalidatePeers();
      invalidateMerged();
      notifications.show({ color: 'green', message: t('federationCard.synced') });
    },
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/federation/peers/${id}`),
    onSuccess: () => {
      invalidatePeers();
      invalidateMerged();
      notifications.show({ color: 'green', message: t('federationCard.removed') });
    },
    onError: showError,
  });

  const publishing = settings?.federation_publish ?? false;
  const feed = settings?.federation_feed_url ?? '';
  const feedIsAbsolute = /^https?:\/\//i.test(feed);

  return (
    <Card withBorder p="lg">
      <Title order={3}>{t('federationCard.title')}</Title>
      <Text size="sm" c="dimmed" mb="md">
        {t('federationCard.description')}
      </Text>

      {/* Section 1 — Publishing */}
      <Title order={4} mb="xs">
        {t('federationCard.publishSectionTitle')}
      </Title>
      <Stack gap="sm">
        <Switch
          label={t('federationCard.publishToggle')}
          description={t('federationCard.publishToggleDescription')}
          checked={publishing}
          disabled={setPublish.isPending}
          onChange={(e) => setPublish.mutate(e.currentTarget.checked)}
        />

        {publishing && feed !== '' && (
          <div>
            <Text size="sm" fw={500} mb={4}>
              {t('federationCard.feedUrlLabel')}
            </Text>
            <Group gap="xs" align="flex-start" wrap="nowrap">
              <TextInput readOnly value={feed} style={{ flex: 1 }} />
              <CopyButton value={feed}>
                {({ copied, copy }) => (
                  <Button variant="light" onClick={copy}>
                    {copied ? t('federationCard.copied') : t('federationCard.copy')}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              {t('federationCard.feedUrlHelp')}
            </Text>
          </div>
        )}

        {publishing && feed !== '' && !feedIsAbsolute && (
          <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
            {t('federationCard.setSiteUrlHint')}
          </Alert>
        )}

        {publishing && feed === '' && (
          <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
            {t('federationCard.setSiteUrlHint')}
          </Alert>
        )}

        {publishing && (
          <Group>
            <Button
              variant="outline"
              color="red"
              leftSection={<IconRefresh size={16} />}
              loading={rotate.isPending}
              onClick={() => {
                if (window.confirm(t('federationCard.rotateWarning'))) {
                  rotate.mutate();
                }
              }}
            >
              {t('federationCard.rotateToken')}
            </Button>
          </Group>
        )}
      </Stack>

      <Divider my="lg" />

      {/* Section 2 — Sibling instances */}
      <Group justify="space-between" mb="xs" wrap="wrap">
        <Title order={4}>{t('federationCard.peersSectionTitle')}</Title>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconRefresh size={14} />}
          loading={syncAll.isPending}
          disabled={(peers?.length ?? 0) === 0}
          onClick={() => syncAll.mutate()}
        >
          {t('federationCard.syncAll')}
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        {t('federationCard.peersSectionDescription')}
      </Text>

      <Group align="flex-end" mb="lg" wrap="nowrap">
        <TextInput
          label={t('federationCard.addFeedUrlLabel')}
          placeholder={t('federationCard.feedUrlPlaceholder')}
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          label={t('federationCard.intervalLabel')}
          data={intervalOptions}
          value={interval}
          onChange={(v) => v && setInterval(v as FederationInterval)}
          w={120}
          allowDeselect={false}
        />
        <Button
          variant="gradient"
          loading={add.isPending}
          disabled={feedUrl.trim().length === 0}
          onClick={() => add.mutate()}
        >
          {t('federationCard.addPeer')}
        </Button>
      </Group>

      <Table.ScrollContainer minWidth={720}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('federationCard.colLabel')}</Table.Th>
              <Table.Th>{t('federationCard.colInterval')}</Table.Th>
              <Table.Th>{t('federationCard.colEnabled')}</Table.Th>
              <Table.Th>{t('federationCard.colLastSynced')}</Table.Th>
              <Table.Th>{t('federationCard.colStatus')}</Table.Th>
              <Table.Th>{t('federationCard.colActivities')}</Table.Th>
              <Table.Th>{t('federationCard.colActions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(peers ?? []).map((peer) => (
              <Table.Tr key={peer.id}>
                <Table.Td>
                  <Text size="sm" style={{ wordBreak: 'break-all' }}>
                    {peer.label || peer.feed_url}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    data={intervalOptions}
                    value={peer.interval}
                    allowDeselect={false}
                    w={100}
                    onChange={(v) =>
                      v && update.mutate({ id: peer.id, patch: { interval: v as FederationInterval } })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={peer.enabled}
                    onChange={(e) =>
                      update.mutate({ id: peer.id, patch: { enabled: e.currentTarget.checked } })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {peer.last_synced_at
                      ? new Date(peer.last_synced_at).toLocaleString()
                      : t('federationCard.never')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {peer.last_status === 'error' ? (
                    <Tooltip label={peer.last_error ?? ''} disabled={!peer.last_error} multiline maw={280}>
                      <Badge color="red" variant="light">
                        {t('federationCard.statusError')}
                      </Badge>
                    </Tooltip>
                  ) : peer.last_status ? (
                    <Badge color="green" variant="light">
                      {t('federationCard.statusOk')}
                    </Badge>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{peer.activity_count.toLocaleString()}</Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label={t('federationCard.syncNow')}>
                      <ActionIcon
                        variant="subtle"
                        loading={syncOne.isPending && syncOne.variables === peer.id}
                        onClick={() => syncOne.mutate(peer.id)}
                      >
                        <IconRefresh size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t('federationCard.remove')}>
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        loading={remove.isPending && remove.variables === peer.id}
                        onClick={() => {
                          if (
                            window.confirm(
                              t('federationCard.confirmRemove', {
                                label: peer.label || peer.feed_url,
                              }),
                            )
                          ) {
                            remove.mutate(peer.id);
                          }
                        }}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {(peers?.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" ta="center" py="md">
                    {t('federationCard.noPeers')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}
