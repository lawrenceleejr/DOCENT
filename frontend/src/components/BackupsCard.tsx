import {
  Badge,
  Button,
  Card,
  Group,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconDatabaseExport, IconDownload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { api, ApiError, buildQuery } from '../api/client';
import type { BackupListResponse } from '../api/types';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const TIER_COLOR: Record<string, string> = {
  daily: 'blue',
  weekly: 'grape',
  monthly: 'teal',
};

export function BackupsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: () => api.get<BackupListResponse>('/api/admin/backups'),
  });

  const runNow = useMutation({
    mutationFn: () => api.post('/api/admin/backups/run'),
    onSuccess: () => {
      // The sidecar picks up the request within ~20s — refresh a couple times.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] }), 4000);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] }), 25000);
    },
  });

  const lastAt = data?.last_backup_at ? new Date(data.last_backup_at) : null;

  return (
    <Card withBorder p="lg">
      <Group justify="space-between" mb="xs">
        <Title order={3}>{t('backupsCard.title')}</Title>
        <Button
          variant="light"
          leftSection={<IconDatabaseExport size={16} />}
          loading={runNow.isPending}
          onClick={() =>
            runNow.mutate(undefined, {
              onError: (e) =>
                alert(e instanceof ApiError ? e.message : t('backupsCard.backupRequestError')),
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
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    component="a"
                    href={`/api/admin/backups/download${buildQuery({ path: b.path })}`}
                    leftSection={<IconDownload size={14} />}
                  >
                    {t('backupsCard.downloadButton')}
                  </Button>
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
    </Card>
  );
}
