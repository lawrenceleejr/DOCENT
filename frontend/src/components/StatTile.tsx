import { Card, Group, Text, ThemeIcon } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';

export function StatTile({
  label,
  value,
  icon: IconCmp,
  color = 'brand',
  sub,
}: {
  label: string;
  value: string | number;
  icon?: Icon;
  color?: string;
  sub?: string;
}) {
  return (
    <Card withBorder p="lg" style={{ flex: 1, minWidth: 150 }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.04em' }}>
          {label}
        </Text>
        {IconCmp && (
          <ThemeIcon variant="light" color={color} radius="md" size={32}>
            <IconCmp size={18} />
          </ThemeIcon>
        )}
      </Group>
      <Text
        fz={34}
        fw={700}
        lh={1.15}
        mt="xs"
        className="tabular-nums"
        style={{ fontFamily: "'Space Grotesk Variable', sans-serif" }}
      >
        {value}
      </Text>
      {sub && (
        <Text size="sm" c="dimmed" mt={2}>
          {sub}
        </Text>
      )}
    </Card>
  );
}
