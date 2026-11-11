import { IconMapPinOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';

export function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
