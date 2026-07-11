import { Button, Stack, Text, ThemeIcon } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';

export function EmptyState({
  icon: IconCmp,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: Icon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Stack align="center" gap="xs" py={48} px="md">
      <ThemeIcon variant="light" color="brand" radius="xl" size={54}>
        <IconCmp size={28} />
      </ThemeIcon>
      <Text fw={600} fz="lg" ta="center">
        {title}
      </Text>
      {description && (
        <Text c="dimmed" size="sm" ta="center" maw={420}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button mt="sm" variant="light" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Stack>
  );
}
