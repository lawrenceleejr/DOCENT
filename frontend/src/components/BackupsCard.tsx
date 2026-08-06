import {
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconDatabaseExport,
  IconDownload,
  IconRestore,
  IconUpload,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api, ApiError, buildQuery } from '../api/client';
import type { BackupListResponse, RestoreStatus } from '../api/types';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const TIER_COLOR: Record<string, string> = {
  daily: 'blue',
  weekly: 'grape',
  monthly: 'teal',
  'pre-restore': 'orange',
  uploads: 'gray',
};

const CONFIRM_WORD = 'RESTORE';

type RestoreTarget = { kind: 'path'; path: string } | { kind: 'upload' };

export function BackupsCard() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: () => api.get<BackupListResponse>('/api/admin/backups'),
  });

  const runNow = useMutation({
    mutationFn: () => api.post('/api/admin/backups/run'),
    onSuccess: () => {
      // The sidecar picks up the request within a few seconds — refresh twice.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] }), 4000);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] }), 15000);
    },
  });

  // Restore flow (#29): pick a target, type the confirmation word, then poll the
  // sidecar's status while it takes a pre-restore backup and runs pg_restore.
  const [opened, { open, close }] = useDisclosure(false);
  const [target, setTarget] = useState<RestoreTarget | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [tracking, setTracking] = useState(false);

  const { data: restoreState } = useQuery({
    queryKey: ['admin', 'restore-status'],
    queryFn: () => api.get<RestoreStatus>('/api/admin/backups/restore-status'),
    enabled: tracking,
    refetchInterval: (query) => {
      const s = query.state.data?.state;
      return s === 'queued' || s === 'running' ? 2500 : false;
    },
  });

  useEffect(() => {
    if (restoreState?.state === 'success') {
      queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
    }
  }, [restoreState?.state, queryClient]);

  const restore = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('confirm', confirmText);
      if (target?.kind === 'path') form.append('path', target.path);
      else if (uploadFile) form.append('file', uploadFile);
      // Multipart upload — bypass the JSON api client.
      const res = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const d = await res.json();
          if (typeof d.detail === 'string') detail = d.detail;
        } catch {
          /* keep statusText */
        }
        throw new ApiError(res.status, detail);
      }
      return (await res.json()) as RestoreStatus;
    },
    onSuccess: () => {
      setTracking(true);
      close();
      setConfirmText('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'restore-status'] });
    },
    onError: (e) =>
      notifications.show({
        color: 'red',
        message: e instanceof ApiError ? e.message : t('backupsCard.restoreError'),
      }),
  });

  const openRestore = (tgt: RestoreTarget) => {
    setTarget(tgt);
    setConfirmText('');
    open();
  };

  const lastAt = data?.last_backup_at ? new Date(data.last_backup_at) : null;
  const confirmOk = confirmText.trim().toUpperCase() === CONFIRM_WORD;
  const inProgress = restoreState?.state === 'queued' || restoreState?.state === 'running';

  // At-a-glance backup health: nightly dumps mean anything older than ~a day
  // (plus cron drift) is a problem worth seeing before you need a restore.
  const ageHours = lastAt ? (Date.now() - lastAt.getTime()) / 3_600_000 : null;
  const healthy = ageHours !== null && ageHours < 26;
  const agoText =
    ageHours === null
      ? null
      : new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }).format(
          ageHours < 48 ? -Math.round(ageHours) : -Math.round(ageHours / 24),
          ageHours < 48 ? 'hour' : 'day',
        );

  return (
    <Card withBorder p="lg">
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Title order={3}>{t('backupsCard.title')}</Title>
          {data && (
            <Badge variant="light" color={healthy ? 'green' : 'red'} size="lg">
              {ageHours === null
                ? t('backupsCard.healthNone')
                : healthy
                  ? t('backupsCard.healthOk', { ago: agoText })
                  : t('backupsCard.healthStale', { ago: agoText })}
            </Badge>
          )}
        </Group>
        <Button
          variant="light"
          leftSection={<IconDatabaseExport size={16} />}
          loading={runNow.isPending}
          onClick={() =>
            runNow.mutate(undefined, {
              onError: (e) =>
                // Toast like every other error in the app; a native alert()
                // here was the odd one out.
                notifications.show({
                  color: 'red',
                  message:
                    e instanceof ApiError ? e.message : t('backupsCard.backupRequestError'),
                }),
            })
          }
        >
          {t('backupsCard.backUpNowButton')}
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        <Trans
          i18nKey="backupsCard.description"
          values={{
            lastBackup: lastAt ? lastAt.toLocaleString() : t('backupsCard.noBackupYet'),
            count: data?.count ?? 0,
            size: fmtSize(data?.total_size_bytes ?? 0),
          }}
          components={{ bold: <b /> }}
        />
        {runNow.isSuccess && ` ${t('backupsCard.backupRequestedNotice')}`}
      </Text>

      {tracking && restoreState && restoreState.state !== 'idle' && (
        <Alert
          mb="md"
          color={
            restoreState.state === 'success'
              ? 'green'
              : restoreState.state === 'failed'
                ? 'red'
                : 'blue'
          }
          icon={inProgress ? <Loader size={16} /> : <IconRestore size={16} />}
          title={t(`backupsCard.restoreState.${restoreState.state}`)}
          withCloseButton={!inProgress}
          onClose={() => setTracking(false)}
        >
          <Text size="sm">{restoreState.detail}</Text>
          {restoreState.state === 'success' && (
            <Button size="xs" mt="xs" onClick={() => window.location.reload()}>
              {t('backupsCard.reloadApp')}
            </Button>
          )}
        </Alert>
      )}

      <Table.ScrollContainer minWidth={480}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('backupsCard.tableBackupHeader')}</Table.Th>
              <Table.Th>{t('backupsCard.tableTierHeader')}</Table.Th>
              <Table.Th>{t('backupsCard.tableTakenHeader')}</Table.Th>
              <Table.Th ta="right">{t('backupsCard.tableSizeHeader')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.items ?? []).slice(0, 20).map((b) => (
              <Table.Tr key={b.path}>
                <Table.Td>
                  <Text size="sm" ff="monospace">
                    {b.path}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={TIER_COLOR[b.tier] ?? 'gray'} size="sm">
                    {b.tier}
                  </Badge>
                </Table.Td>
                <Table.Td>{new Date(b.modified_at).toLocaleString()}</Table.Td>
                <Table.Td ta="right" className="tabular-nums">
                  {fmtSize(b.size_bytes)}
                </Table.Td>
                <Table.Td ta="right">
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      component="a"
                      href={`/api/admin/backups/download${buildQuery({ path: b.path })}`}
                      leftSection={<IconDownload size={14} />}
                    >
                      {t('backupsCard.downloadButton')}
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      leftSection={<IconRestore size={14} />}
                      onClick={() => openRestore({ kind: 'path', path: b.path })}
                    >
                      {t('backupsCard.restoreButton')}
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {(data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center" py="md">
                    {t('backupsCard.emptyState')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Group mt="md" gap="sm" align="center">
        <FileButton accept=".dump" onChange={setUploadFile}>
          {(props) => (
            <Button variant="default" size="xs" leftSection={<IconUpload size={14} />} {...props}>
              {t('backupsCard.chooseFileButton')}
            </Button>
          )}
        </FileButton>
        {uploadFile && (
          <Text size="sm" ff="monospace">
            {uploadFile.name}
          </Text>
        )}
        <Button
          size="xs"
          color="red"
          variant="light"
          disabled={!uploadFile}
          leftSection={<IconRestore size={14} />}
          onClick={() => openRestore({ kind: 'upload' })}
        >
          {t('backupsCard.restoreUploadButton')}
        </Button>
      </Group>

      <Modal opened={opened} onClose={close} title={t('backupsCard.restoreModalTitle')} centered>
        <Stack>
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            {t('backupsCard.restoreWarning')}
          </Alert>
          <Text size="sm">
            {target?.kind === 'path'
              ? t('backupsCard.restoreFromBackup', { path: target.path })
              : t('backupsCard.restoreFromUpload', { name: uploadFile?.name ?? '' })}
          </Text>
          <Text size="sm" c="dimmed">
            {t('backupsCard.restoreSafetyNote')}
          </Text>
          <TextInput
            label={t('backupsCard.typeToConfirm', { word: CONFIRM_WORD })}
            placeholder={CONFIRM_WORD}
            value={confirmText}
            onChange={(e) => setConfirmText(e.currentTarget.value)}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              loading={restore.isPending}
              disabled={!confirmOk}
              onClick={() => restore.mutate()}
            >
              {t('backupsCard.confirmRestoreButton')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
