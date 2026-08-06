// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import { Button, Card, Code, Collapse, Container, Group, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  showDetail: boolean;
}

/**
 * Catches render-time crashes. Without this, one thrown error unmounts the
 * whole tree and the user is left staring at a blank white page with no clue
 * what happened or what to do.
 *
 * Deliberately not translated: i18n itself may be what failed, and this must
 * render under any condition.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showDetail: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep it in the console for a bug report; there's no error-reporting
    // service to phone home to (and self-hosters wouldn't want one).
    console.error('DOCENT crashed while rendering:', error, info.componentStack);
  }

  render() {
    const { error, showDetail } = this.state;
    if (!error) return this.props.children;

    return (
      <Container size="sm" py="xl">
        <Card withBorder p="xl">
          <Stack gap="sm">
            <Group gap="xs">
              <IconAlertTriangle size={22} color="var(--mantine-color-red-6)" />
              <Title order={3}>Something went wrong</Title>
            </Group>
            <Text c="dimmed" size="sm">
              DOCENT hit an unexpected error while drawing this page. Your data is safe — this
              is a display problem, not a lost-data problem. Reloading usually clears it.
            </Text>
            <Group>
              <Button leftSection={<IconRefresh size={16} />} onClick={() => window.location.reload()}>
                Reload the page
              </Button>
              <Button variant="default" component="a" href="/">
                Go to Events
              </Button>
              <Button
                variant="subtle"
                color="gray"
                onClick={() => this.setState((s) => ({ showDetail: !s.showDetail }))}
              >
                {showDetail ? 'Hide details' : 'Show details'}
              </Button>
            </Group>
            <Collapse in={showDetail}>
              <Text size="xs" c="dimmed" mb={4}>
                Include this when reporting the problem:
              </Text>
              <Code block style={{ whiteSpace: 'pre-wrap' }}>
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ''}
              </Code>
            </Collapse>
          </Stack>
        </Card>
      </Container>
    );
  }
}
