import { Alert } from '@mantine/core';
import { IconLanguage } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { baseLanguage } from '../i18n';

/** Shown whenever the UI is displayed in a non-English language — these
 * translations are machine-generated and haven't been reviewed by a native
 * speaker yet. Dismissible per page load; reappears on the next visit. */
export function TranslationDisclaimer() {
  const { t, i18n } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (baseLanguage(i18n.language) === 'en' || dismissed) return null;

  return (
    <Alert
      icon={<IconLanguage size={16} />}
      color="yellow"
      variant="light"
      withCloseButton
      onClose={() => setDismissed(true)}
      radius="md"
      mb="md"
    >
      {t('common.translationDisclaimer')}
    </Alert>
  );
}
