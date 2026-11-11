import { Center, Loader } from '@mantine/core';
import { IconCloudOff, IconMapPinOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { EmptyState } from './EmptyState';

/** What a page shows while its main record is loading, missing, or failed to
 * load — instead of a blank page under the header. */
export function QueryState({
  isLoading,
  error,
  onRetry,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (isLoading) {
    return (
      <Center py={80}>
        <Loader />
      </Center>
    );
  }
  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
    return (
      <EmptyState
        icon={IconMapPinOff}
        title={t('common.notFoundTitle')}
        description={t('common.notFoundBody')}
        actionLabel={t('common.backToEvents')}
        onAction={() => navigate('/')}
      />
    );
  }
  return (
    <EmptyState
      icon={IconCloudOff}
      title={t('common.loadFailedTitle')}
      description={error instanceof Error && error.message ? error.message : t('common.loadFailedBody')}
      actionLabel={onRetry ? t('common.retry') : undefined}
      onAction={onRetry}
    />
  );
}
