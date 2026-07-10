import { Card, Text } from '@mantine/core';

export function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card withBorder p="md" style={{ flex: 1, minWidth: 150 }}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text fz={30} fw={700} lh={1.3}>
        {value}
      </Text>
    </Card>
  );
}
