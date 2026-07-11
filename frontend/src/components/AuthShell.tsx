import { Anchor, Box, Center, List, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconCalendarEvent,
  IconChartHistogram,
  IconMapPin,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { LogoReveal } from './LogoReveal';

const HIGHLIGHTS = [
  { icon: IconMapPin, text: 'Map every school, college, museum & library you reach' },
  { icon: IconCalendarEvent, text: 'Plan events and export them to your calendar' },
  { icon: IconChartHistogram, text: 'See your community’s collective impact at a glance' },
];

/**
 * Two-panel auth layout: a gradient brand hero (left) beside the form (right).
 * Collapses to a single column with a compact hero band on small screens.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <Box className="auth-grid">
      {/* Hero panel */}
      <Box
        visibleFrom="sm"
        style={{
          background: 'linear-gradient(150deg, #4423a3 0%, #6d41ec 45%, #b14fe0 100%)',
          color: '#fff',
          padding: '3rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '2.75rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(60% 50% at 85% 15%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%)',
            pointerEvents: 'none',
          }}
        />
        <Center style={{ position: 'relative' }}>
          <LogoReveal size={200} showTagline />
        </Center>

        <Stack gap="lg" style={{ position: 'relative', maxWidth: 460, alignSelf: 'center' }}>
          <Text fz="lg" ta="center" style={{ opacity: 0.9 }}>
            <b>Reach out.</b> The shared record of your scientific community’s outreach —
            every classroom visit, lab tour, and public talk, in one place.
          </Text>
          <List spacing="sm" listStyleType="none">
            {HIGHLIGHTS.map((h) => (
              <List.Item
                key={h.text}
                icon={
                  <ThemeIcon
                    variant="white"
                    color="dark"
                    radius="xl"
                    size={28}
                    style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
                  >
                    <h.icon size={16} />
                  </ThemeIcon>
                }
              >
                <Text style={{ opacity: 0.95 }}>{h.text}</Text>
              </List.Item>
            ))}
          </List>
        </Stack>
      </Box>

      {/* Form panel */}
      <Box style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
        <Center style={{ flex: 1 }}>
          <Box w="100%" maw={400}>
            {children}
          </Box>
        </Center>
        <Text size="xs" c="dimmed" ta="center" mt="lg">
          DOCENT · © 2026 Lawrence Lee · Free software under the{' '}
          <Anchor
            href="https://www.gnu.org/licenses/gpl-3.0.html"
            target="_blank"
            rel="noreferrer"
            c="dimmed"
            underline="always"
          >
            GNU GPL v3
          </Anchor>
        </Text>
      </Box>
    </Box>
  );
}
