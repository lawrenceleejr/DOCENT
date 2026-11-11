import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Component, type ReactNode } from 'react';
import i18n from '../i18n';

/** Last line of defence: a rendering bug shows a message and a way back
 * instead of a blank white page. Also catches a lazily-loaded page failing to
 * download (e.g. right after an upgrade replaced the files) — reloading fetches
 * the new build. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Center mih="70vh" p="md">
        <Stack align="center" gap="xs" maw={440}>
          <Title order={2} ta="center">
            {i18n.t('common.crashTitle')}
          </Title>
          <Text c="dimmed" ta="center">
            {i18n.t('common.crashBody')}
          </Text>
          <Button mt="sm" onClick={() => window.location.reload()}>
            {i18n.t('common.reload')}
          </Button>
        </Stack>
      </Center>
    );
  }
}
