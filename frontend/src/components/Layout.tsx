import {
  ActionIcon,
  Anchor,
  AppShell,
  Avatar,
  Box,
  Container,
  Group,
  Menu,
  ScrollArea,
  Tabs,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconLogout, IconMenu2, IconMoon, IconSun, IconUser } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Logo } from './Logo';

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('dark', { getInitialValueInEffect: true });
  const isDark = computed === 'dark';
  return (
    <ActionIcon
      variant="default"
      size="lg"
      radius="md"
      aria-label="Toggle color scheme"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  );
}

const TABS = [
  { value: '/', label: 'Visits' },
  { value: '/schedule', label: 'Schedule' },
  { value: '/venues', label: 'Venues' },
  { value: '/map', label: 'Map' },
  { value: '/analysis', label: 'Analysis' },
  { value: '/reports', label: 'Reports' },
];

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Instance branding (community name) — public config, cached aggressively.
  const { data: config } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/api/auth/config'),
    staleTime: 5 * 60 * 1000,
  });
  const siteName = config?.site_name ?? '';

  const tabs = [...TABS, ...(user?.is_admin ? [{ value: '/admin', label: 'Admin' }] : [])];
  const active =
    tabs
      .filter((t) => t.value !== '/')
      .find((t) => location.pathname.startsWith(t.value))?.value ?? '/';

  // Keep the browser tab title in sync with the section ("Visits · DOCENT").
  useEffect(() => {
    const section =
      location.pathname === '/profile'
        ? 'Profile'
        : tabs.find((t) => t.value === active)?.label ?? '';
    document.title = section ? `${section} · DOCENT` : 'DOCENT';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, active]);

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header
        style={{ backdropFilter: 'blur(8px)', background: 'var(--mantine-color-body)' }}
      >
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="lg" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <UnstyledButton
              onClick={() => navigate('/')}
              style={{ flexShrink: 0 }}
              aria-label="DOCENT home"
            >
              <Group gap={8} wrap="nowrap">
                <Logo size={30} ping />
                {siteName && (
                  <Text fw={700} size="sm" visibleFrom="md" style={{ whiteSpace: 'nowrap' }}>
                    {siteName}
                  </Text>
                )}
              </Group>
            </UnstyledButton>
            {/* Desktop: full tab strip. Below sm a burger menu replaces this
                (a horizontal-scrolling pill strip was unreadably cramped and
                mostly-hidden on phone-width screens). */}
            <ScrollArea type="never" style={{ minWidth: 0 }} visibleFrom="sm">
              <Tabs
                value={active}
                onChange={(value) => value && navigate(value)}
                variant="pills"
                color="brand"
              >
                <Tabs.List style={{ flexWrap: 'nowrap' }}>
                  {tabs.map((tab) => (
                    <Tabs.Tab key={tab.value} value={tab.value} fw={600}>
                      {tab.label}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            </ScrollArea>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Box hiddenFrom="sm">
              <Menu shadow="md" width={200} position="bottom-end">
                <Menu.Target>
                  <ActionIcon
                    variant="default"
                    size="lg"
                    radius="md"
                    aria-label="Open navigation menu"
                  >
                    <IconMenu2 size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {tabs.map((tab) => (
                    <Menu.Item
                      key={tab.value}
                      onClick={() => navigate(tab.value)}
                      fw={active === tab.value ? 700 : 400}
                      c={active === tab.value ? 'brand' : undefined}
                    >
                      {tab.label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Box>
            <ColorSchemeToggle />
            <Menu shadow="md" width={220} position="bottom-end">
              <Menu.Target>
                <UnstyledButton aria-label="Account menu">
                  <Group gap="xs" wrap="nowrap">
                    <Avatar color="brand" radius="xl" size={32}>
                      {initials(user?.name)}
                    </Avatar>
                    <Text size="sm" fw={600} visibleFrom="sm">
                      {user?.name}
                    </Text>
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user?.email}</Menu.Label>
                <Menu.Item
                  leftSection={<IconUser size={16} />}
                  onClick={() => navigate('/profile')}
                >
                  Profile
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={16} />}
                  onClick={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  Log out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">{children}</Container>
        <Container size="xl" py="lg">
          <Text size="xs" c="dimmed" ta="center">
            DOCENT {APP_VERSION} · © {COPYRIGHT_YEAR} Lawrence Lee · Free software under the{' '}
            <Anchor href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" c="dimmed" underline="always">
              GNU GPL v3
            </Anchor>
          </Text>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

const COPYRIGHT_YEAR = 2026;
// Keep in step with package.json / backend version / CHANGELOG.
const APP_VERSION = 'v0.1.0';
