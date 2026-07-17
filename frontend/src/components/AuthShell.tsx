import { Anchor, Box, Center, List, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconCalendarEvent,
  IconChartHistogram,
  IconMapPin,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LogoReveal } from './LogoReveal';
import { TranslationDisclaimer } from './TranslationDisclaimer';

/**
 * Two-panel auth layout: a gradient brand hero (left) beside the form (right).
 * Collapses to a single column with a compact hero band on small screens.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const HIGHLIGHTS = [
    { icon: IconMapPin, text: t('authShell.highlightMap') },
    { icon: IconCalendarEvent, text: t('authShell.highlightCalendar') },
    { icon: IconChartHistogram, text: t('authShell.highlightReports') },
  ];
  return (
    <Box className="auth-grid" style={{ position: 'relative' }}>
      <Box pos="absolute" top="1rem" right="1rem" style={{ zIndex: 1 }}>
        <LanguageSwitcher />
      </Box>
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
            <b>{t('authShell.taglineBold')}</b> {t('authShell.taglineRest')}
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
            <TranslationDisclaimer />
            {children}
          </Box>
        </Center>
        <Text size="xs" c="dimmed" ta="center" mt="lg">
          {t('authShell.footerPrefix')}{' '}
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
