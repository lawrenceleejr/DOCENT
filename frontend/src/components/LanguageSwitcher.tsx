import { ActionIcon, Menu } from '@mantine/core';
import { IconLanguage } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { baseLanguage, SUPPORTED_LANGUAGES } from '../i18n';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const activeCode = baseLanguage(i18n.language);
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === activeCode);

  return (
    <Menu shadow="md" width={180} position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="default"
          size="lg"
          radius="md"
          aria-label={t('layout.language')}
          title={current?.label ?? t('layout.language')}
        >
          <IconLanguage size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Menu.Item
            key={lang.code}
            fw={activeCode === lang.code ? 700 : 400}
            c={activeCode === lang.code ? 'brand' : undefined}
            onClick={() => i18n.changeLanguage(lang.code)}
          >
            {lang.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
