import { Badge, Card, Collapse, Group, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconFilter } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/**
 * A filter bar in a Card. On desktop it's always expanded (identical to a
 * plain Card). Below the `sm` breakpoint it collapses behind a "Filters"
 * toggle by default — a phone-width screen can't fit 5-8 filter fields at
 * once, so we hide them until asked for instead of rendering them cramped.
 */
export function FilterCard({
  children,
  activeCount = 0,
}: {
  children: ReactNode;
  activeCount?: number;
}) {
  // Mirrors the "sm" breakpoint used by hiddenFrom/visibleFrom elsewhere in
  // the app, so this collapses exactly where the header switches to mobile.
  const isMobile = useMediaQuery('(max-width: 47.99em)') ?? false;
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <Card withBorder p="md">
      {isMobile && (
        <UnstyledButton onClick={toggle} w="100%" mb={opened ? 'sm' : 0}>
          <Group justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              <IconFilter size={16} />
              <Text fw={600} size="sm">
                Filters
              </Text>
              {activeCount > 0 && (
                <Badge size="sm" variant="filled" circle>
                  {activeCount}
                </Badge>
              )}
            </Group>
            {opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </Group>
        </UnstyledButton>
      )}
      <Collapse in={!isMobile || opened}>{children}</Collapse>
    </Card>
  );
}
