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
        <Title order={3}>Backups</Title>
        <Button
          variant="light"
          leftSection={<IconDatabaseExport size={16} />}
          loading={runNow.isPending}
          onClick={() =>
            runNow.mutate(undefined, {
              onError: (e) =>
                alert(e instanceof ApiError ? e.message : 'Could not request a backup'),
            })
          }
        >
          Back up now
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Nightly database dumps stored on the server. Last backup:{' '}
        <b>{lastAt ? lastAt.toLocaleString() : 'none yet'}</b> · {data?.count ?? 0} kept ·{' '}
        {fmtSize(data?.total_size_bytes ?? 0)}. Download copies and keep them somewhere safe
        off this machine.
        {runNow.isSuccess && ' A backup was requested — it appears here within a minute.'}
      </Text>

      <Table.ScrollContainer minWidth={480}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Backup</Table.Th>
              <Table.Th>Tier</Table.Th>
              <Table.Th>Taken</Table.Th>
              <Table.Th ta="right">Size</Table.Th>
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
                    Download
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
            {(data?.items.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center" py="md">
                    No backups found yet. One runs automatically each night.
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
