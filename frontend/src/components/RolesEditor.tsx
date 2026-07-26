import { ActionIcon, Autocomplete, Button, Group, Stack, Text } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { UserRole } from '../api/types';

/** Editor for the additional roles a communicator holds, inside or outside
 * their primary institution (#22). Each row is a free-text Autocomplete pair
 * (title + organization); blank rows are cleaned server-side on save. */
export function RolesEditor({
  value,
  onChange,
  titleOptions,
  organizationOptions,
}: {
  value: UserRole[];
  onChange: (roles: UserRole[]) => void;
  titleOptions: string[];
  organizationOptions: string[];
}) {
  const { t } = useTranslation();

  const update = (index: number, patch: Partial<UserRole>) =>
    onChange(value.map((role, i) => (i === index ? { ...role, ...patch } : role)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { title: '', organization: '' }]);

  return (
    <Stack gap="xs">
      {value.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('profile.rolesEmpty')}
        </Text>
      )}
      {value.map((role, index) => (
        <Group key={index} align="flex-end" gap="xs" wrap="nowrap">
          <Autocomplete
            label={index === 0 ? t('profile.roleTitleLabel') : undefined}
            placeholder={t('profile.roleTitlePlaceholder')}
            data={titleOptions}
            value={role.title}
            onChange={(v) => update(index, { title: v })}
            style={{ flex: 1 }}
          />
          <Autocomplete
            label={index === 0 ? t('profile.roleOrgLabel') : undefined}
            placeholder={t('profile.roleOrgPlaceholder')}
            data={organizationOptions}
            value={role.organization ?? ''}
            onChange={(v) => update(index, { organization: v })}
            style={{ flex: 1 }}
          />
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label={t('profile.removeRole')}
            onClick={() => remove(index)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
      <Group>
        <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={add}>
          {t('profile.addRole')}
        </Button>
      </Group>
    </Stack>
  );
}
