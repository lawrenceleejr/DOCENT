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
import { Trans, useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { DbImportResult } from '../api/types';

export function DbToolsCard() {
  const { t } = useTranslation();
  const [result, setResult] = useState<DbImportResult | null>(null);

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ApiError(400, t('dbToolsCard.invalidJsonError'));
      }
      return api.post<DbImportResult>('/api/admin/db/import', payload);
    },
    onSuccess: (r) => {
      setResult(r);
      notifications.show({
        color: 'green',
        title: t('dbToolsCard.importCompleteTitle'),
        message: t('dbToolsCard.importCompleteMessage', {
          count: r.visits_created,
          created: r.visits_created,
          skipped: r.visits_skipped,
        }),
      });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('dbToolsCard.importFailedTitle'),
        message: e instanceof ApiError ? e.message : t('dbToolsCard.unexpectedError'),
      });
    },
  });

  return (
    <Card withBorder p="lg">
      <Group gap="xs" mb="xs">
        <IconDatabaseExport size={20} />
        <Title order={3}>{t('dbToolsCard.title')}</Title>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        <Trans i18nKey="dbToolsCard.description" components={{ merges: <strong />, backups: <strong /> }} />
      </Text>

      <Group>
        <Button
          component="a"
          href="/api/admin/db/export"
          variant="default"
          leftSection={<IconDatabaseExport size={18} />}
        >
          {t('dbToolsCard.exportButton')}
        </Button>
        <FileButton onChange={(f) => f && importMut.mutate(f)} accept="application/json,.json">
          {(props) => (
            <Button
              {...props}
              loading={importMut.isPending}
              leftSection={<IconDatabaseImport size={18} />}
            >
              {t('dbToolsCard.importButton')}
            </Button>
          )}
        </FileButton>
      </Group>

      {result && (
        <>
          <Divider my="md" />
          <Alert color="teal" variant="light" icon={<IconInfoCircle size={16} />}>
            <Text fw={600} size="sm" mb={4}>
              {t('dbToolsCard.mergeResultTitle')}
            </Text>
            <List size="sm" spacing={2}>
              <List.Item>{t('dbToolsCard.visitsAdded', { count: result.visits_created })}</List.Item>
              <List.Item>{t('dbToolsCard.visitsSkipped', { count: result.visits_skipped })}</List.Item>
              <List.Item>{t('dbToolsCard.venuesAdded', { count: result.venues_created })}</List.Item>
              <List.Item>
                {t('dbToolsCard.institutionsAdded', { count: result.institutions_created })}
              </List.Item>
              <List.Item>
                {t('dbToolsCard.authorsCreated', { count: result.users_created })}
              </List.Item>
            </List>
          </Alert>
        </>
      )}
    </Card>
  );
}
