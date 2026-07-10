import {
  ActionIcon,
  AppShell,
  Container,
  Group,
  Menu,
  Tabs,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('dark', { getInitialValueInEffect: true });
  const isDark = computed === 'dark';
  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label="Toggle color scheme"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? '☀' : '☾'}
    </ActionIcon>
  );
}

const TABS = [
  { value: '/', label: 'Visits' },
  { value: '/schedule', label: 'Schedule' },
  { value: '/venues', label: 'Venues' },
  { value: '/map', label: 'Map' },
  { value: '/analysis', label: 'Analysis' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [...TABS, ...(user?.is_admin ? [{ value: '/admin', label: 'Admin' }] : [])];
  const active =
    tabs
      .filter((t) => t.value !== '/')
      .find((t) => location.pathname.startsWith(t.value))?.value ?? '/';

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xl" wrap="nowrap">
            <UnstyledButton onClick={() => navigate('/')}>
              <Text fw={800} size="lg">
                DOCENT
              </Text>
            </UnstyledButton>
            <Tabs value={active} onChange={(value) => value && navigate(value)}>
              <Tabs.List>
                {tabs.map((tab) => (
                  <Tabs.Tab key={tab.value} value={tab.value}>
                    {tab.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <ColorSchemeToggle />
            <Menu shadow="md" width={200}>
            <Menu.Target>
              <UnstyledButton>
                <Text size="sm" fw={500}>
                  {user?.name} ▾
                </Text>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => navigate('/profile')}>Profile</Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
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
      </AppShell.Main>
    </AppShell>
  );
}
