// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import { Alert, Button, Card, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';

/**
 * Shown when a query fails. This exists so a server error is never mistaken
 * for "you have no data": an empty state must only ever mean "loaded, and
 * genuinely zero". Without it a 500 rendered as "Log your first event" to
 * someone with hundreds of them.
 */
export function QueryError({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  /** Inline alert instead of a full card — for a panel inside a page. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  // A 401 means the session lapsed rather than the server breaking; say so, as
  // the fix (sign in again) is completely different.
  const unauthorized = error instanceof ApiError && error.status === 401;
  const detail = error instanceof ApiError ? error.message : null;
  const title = unauthorized ? t('errors.sessionExpiredTitle') : t('errors.loadFailedTitle');
  const body = unauthorized ? t('errors.sessionExpiredBody') : t('errors.loadFailedBody');

  const retry = onRetry && !unauthorized && (
    <Button
      size="xs"
      variant="light"
      leftSection={<IconRefresh size={14} />}
      onClick={onRetry}
      mt={compact ? 'xs' : 'sm'}
    >
      {t('errors.retry')}
    </Button>
  );

  if (compact) {
    return (
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title={title}>
        <Text size="sm">{body}</Text>
        {detail && (
          <Text size="xs" c="dimmed" mt={4}>
            {detail}
          </Text>
        )}
        {retry}
      </Alert>
    );
  }

  return (
    <Card withBorder p="xl">
      <Stack align="center" gap="xs">
        <Group gap="xs">
          <IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />
          <Text fw={600}>{title}</Text>
        </Group>
        <Text c="dimmed" size="sm" ta="center" maw={460}>
          {body}
        </Text>
        {detail && (
          <Text c="dimmed" size="xs" ta="center" maw={460}>
            {detail}
          </Text>
        )}
        {retry}
      </Stack>
    </Card>
  );
}
