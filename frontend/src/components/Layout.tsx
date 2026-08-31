import {
  ActionIcon,
  Alert,
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
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { isOverdue, type ActivityListItem, type AuthConfig, type Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { GITHUB_CONTRIBUTING_URL, GITHUB_README_URL } from '../links';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { TranslationDisclaimer } from './TranslationDisclaimer';

function ColorSchemeToggle() {
  const { t } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('dark', { getInitialValueInEffect: true });
  const isDark = computed === 'dark';
  return (
    <ActionIcon
      variant="default"
      size="lg"
      radius="md"
      aria-label={t('layout.toggleColorScheme')}
      title={isDark ? t('layout.switchToLight') : t('layout.switchToDark')}
      onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  );
}

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Nudge users who haven't filled in any optional profile detail to do so
  // (#23). Dismissible for the session.
  const profileEmpty =
    !!user &&
    !user.affiliation &&
    !user.position &&
    !user.orcid &&
    user.languages_spoken.length === 0;
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('docent_profile_nudge') === '1';
    } catch {
      return false;
    }
  });
  const dismissNudge = () => {
    try {
      sessionStorage.setItem('docent_profile_nudge', '1');
    } catch {
      /* storage may be unavailable */
    }
    setNudgeDismissed(true);
  };
  const showProfileNudge = profileEmpty && !nudgeDismissed && location.pathname !== '/profile';

  // Visits this user still needs to write up — past scheduled events not yet
  // marked done. Surfaced as a banner with links to the first few (#26).
  const { data: myPlanned } = useQuery({
    queryKey: ['visits', 'needs-report', user?.id],
    queryFn: () =>
      api.get<Paginated<ActivityListItem>>('/api/visits', {
        author_id: user!.id,
        status: 'planned',
        sort: 'visit_date',
        page_size: 100,
      }),
    enabled: !!user,
  });
  const needsReport = (myPlanned?.items ?? []).filter(
    (it) => it.source === 'local' && it.status && isOverdue({ status: it.status, visit_date: it.visit_date }),
  );
  const [reportDismissed, setReportDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('docent_needs_report') === '1';
    } catch {
      return false;
    }
  });
  const dismissReport = () => {
    try {
      sessionStorage.setItem('docent_needs_report', '1');
    } catch {
      /* storage may be unavailable */
    }
    setReportDismissed(true);
  };
  const showNeedsReport = needsReport.length > 0 && !reportDismissed;

  const TABS = [
    { value: '/', label: t('layout.nav.visits') },
    { value: '/schedule', label: t('layout.nav.schedule') },
    { value: '/venues', label: t('layout.nav.venues') },
    { value: '/map', label: t('layout.nav.map') },
    { value: '/analysis', label: t('layout.nav.analysis') },
    { value: '/reports', label: t('layout.nav.reports') },
  ];

  // Instance branding (community name) — public config, cached aggressively.
  const { data: config } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/api/auth/config'),
    staleTime: 5 * 60 * 1000,
  });
  const siteName = config?.site_name ?? '';

  const tabs = [
    ...TABS,
    ...(user?.is_admin || config?.user_directory_visible
      ? [{ value: '/directory', label: t('layout.nav.directory') }]
      : []),
    ...(user?.is_admin ? [{ value: '/admin', label: t('layout.nav.admin') }] : []),
  ];
  const active =
    tabs
      .filter((tab) => tab.value !== '/')
      .find((tab) => location.pathname.startsWith(tab.value))?.value ?? '/';

  // Keep the browser tab title in sync with the section ("Visits · DOCENT").
  useEffect(() => {
    const section =
      location.pathname === '/profile'
        ? t('layout.profile')
        : tabs.find((tab) => tab.value === active)?.label ?? '';
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
              aria-label={t('layout.home')}
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
                    aria-label={t('layout.openMenu')}
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
            <LanguageSwitcher />
            <ColorSchemeToggle />
            <Menu shadow="md" width={220} position="bottom-end">
              <Menu.Target>
                <UnstyledButton aria-label={t('layout.accountMenu')}>
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
                  {t('layout.profile')}
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
                  {t('layout.logout')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          {config?.banner_message && (
            // Admin-set site-wide notice, colored by severity (#24).
            <Alert
              color={BANNER_COLORS[config.banner_level] ?? 'blue'}
              variant="light"
              mb="md"
            >
              {config.banner_message}
            </Alert>
          )}
          {showNeedsReport && (
            // Remind the user of past events they still need to write up (#26).
            <Alert
              color="yellow"
              variant="light"
              mb="md"
              withCloseButton
              onClose={dismissReport}
              title={t('layout.needsReportTitle', { count: needsReport.length })}
            >
              {t('layout.needsReportText')}{' '}
              {needsReport.slice(0, 3).map((v, i) => (
                <span key={v.id}>
                  {i > 0 && ', '}
                  <Anchor component={Link} to={`/visits/${v.id}/edit`}>
                    {v.title || v.venue?.name || v.visit_date}
                  </Anchor>
                </span>
              ))}
              {needsReport.length > 3 && ` ${t('layout.needsReportMore', { count: needsReport.length - 3 })}`}
            </Alert>
          )}
          {showProfileNudge && (
            // Invite users who haven't filled in their profile to complete it (#23).
            <Alert
              color="brand"
              variant="light"
              mb="md"
              withCloseButton
              onClose={dismissNudge}
              title={t('layout.completeProfileTitle')}
            >
              {t('layout.completeProfileText')}{' '}
              <Anchor component={Link} to="/profile">
                {t('layout.completeProfileLink')}
              </Anchor>
            </Alert>
          )}
          <TranslationDisclaimer />
          {/* Keyed by path so React remounts on navigation, replaying the
              subtle fade-in (see .app-route-fade in styles.css). */}
          <div key={location.pathname} className="app-route-fade">
            {children}
          </div>
        </Container>
        <Container size="xl" py="lg">
          <Text size="xs" c="dimmed" ta="center">
            {t('layout.footerPrefix', { version: APP_VERSION, year: COPYRIGHT_YEAR })}{' '}
            <Anchor href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" c="dimmed" underline="always">
              GNU GPL v3
            </Anchor>{' · '}
            <Anchor href={GITHUB_README_URL} target="_blank" c="dimmed" underline="always">
              {t('layout.footerGithub')}
            </Anchor>{' · '}
            <Anchor href={GITHUB_CONTRIBUTING_URL} target="_blank" c="dimmed" underline="always">
              {t('layout.footerSuggestions')}
            </Anchor>
            {/* Only linked once an admin has actually published the document,
                so the footer never points at a 404. */}
            {config?.published_policies?.includes('privacy') && (
              <>
                {' \u00b7 '}
                <Anchor component={Link} to="/privacy" c="dimmed" underline="always">
                  {t('layout.footerPrivacy')}
                </Anchor>
              </>
            )}
            {config?.published_policies?.includes('terms') && (
              <>
                {' \u00b7 '}
                <Anchor component={Link} to="/terms" c="dimmed" underline="always">
                  {t('layout.footerTerms')}
                </Anchor>
              </>
            )}
          </Text>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

const BANNER_COLORS: Record<string, string> = {
  info: 'blue',
  warning: 'yellow',
  critical: 'red',
};

const COPYRIGHT_YEAR = 2026;
// The footer version: the git tag when this commit is tagged, otherwise the
// short commit hash. Injected at build time — see vite.config.ts (#26).
const APP_VERSION = __APP_VERSION__;
