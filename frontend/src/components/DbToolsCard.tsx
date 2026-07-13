import {
  Alert,
  Button,
  Card,
  Divider,
  FileButton,
  Group,
  List,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDatabaseExport, IconDatabaseImport, IconInfoCircle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { DbImportResult } from '../api/types';

export function DbToolsCard() {
  const [result, setResult] = useState<DbImportResult | null>(null);

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ApiError(400, 'That file isn’t valid JSON.');
      }
      return api.post<DbImportResult>('/api/admin/db/import', payload);
    },
    onSuccess: (r) => {
      setResult(r);
      notifications.show({
        color: 'green',
        title: 'Import complete',
        message: `${r.visits_created} new visit(s) added, ${r.visits_skipped} already present.`,
      });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Import failed',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  return (
    <Card withBorder p="lg">
      <Group gap="xs" mb="xs">
        <IconDatabaseExport size={20} />
        <Title order={3}>Export &amp; import data</Title>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Move or combine outreach data between DOCENT instances. The export is a portable
        JSON file of institutions, venues, visits, and their authors. Importing{' '}
        <strong>merges</strong> — records that already exist (matched by natural key) are
        left untouched, so re-importing never creates duplicates. This is separate from the
        automatic database <strong>backups</strong> below.
      </Text>

      <Group>
        <Button
          component="a"
          href="/api/admin/db/export"
          variant="default"
          leftSection={<IconDatabaseExport size={18} />}
        >
          Export data (JSON)
        </Button>
        <FileButton onChange={(f) => f && importMut.mutate(f)} accept="application/json,.json">
          {(props) => (
            <Button
              {...props}
              loading={importMut.isPending}
              leftSection={<IconDatabaseImport size={18} />}
            >
              Import &amp; merge…
            </Button>
          )}
        </FileButton>
      </Group>

      {result && (
        <>
          <Divider my="md" />
          <Alert color="teal" variant="light" icon={<IconInfoCircle size={16} />}>
            <Text fw={600} size="sm" mb={4}>
              Merge result
            </Text>
            <List size="sm" spacing={2}>
              <List.Item>{result.visits_created} visit(s) added</List.Item>
              <List.Item>{result.visits_skipped} visit(s) already present (skipped)</List.Item>
              <List.Item>{result.venues_created} venue(s) added</List.Item>
              <List.Item>{result.institutions_created} institution(s) added</List.Item>
              <List.Item>
                {result.users_created} author placeholder(s) created (inactive — enable a login
                from the user list if needed)
              </List.Item>
            </List>
          </Alert>
        </>
      )}
    </Card>
  );
}
