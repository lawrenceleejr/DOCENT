import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconDots,
  IconGitMerge,
  IconKey,
  IconPencil,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type {
  AdminUser,
  Paginated,
  PasswordResetResult,
  RegistrationSettings,
  User,
} from '../api/types';
import { LANGUAGES } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { BackupsCard } from '../components/BackupsCard';
import { InstitutionImportCard } from '../components/InstitutionImportCard';
import { InstitutionManagerCard } from '../components/InstitutionManagerCard';
import { SiteSetupCard } from '../components/SiteSetupCard';
import { DbToolsCard } from '../components/DbToolsCard';
import { VenueFilterSelect } from '../components/VenueFilterSelect';

const PAGE_SIZE = 25;

function RegistrationCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<RegistrationSettings>('/api/admin/settings'),
  });
  const [code, setCode] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [publicPage, setPublicPage] = useState<boolean | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [mapLat, setMapLat] = useState<number | string | null>(null);
  const [mapLon, setMapLon] = useState<number | string | null>(null);
  const [directoryVisible, setDirectoryVisible] = useState<boolean | null>(null);

  const codeValue = code ?? data?.invite_code ?? '';
  const emailValue = email ?? data?.contact_email ?? '';
  const nameValue = name ?? data?.site_name ?? '';
  const publicValue = publicPage ?? data?.public_page ?? false;
  const loginMessageValue = loginMessage ?? data?.login_message ?? '';
  const mapLatValue = mapLat ?? data?.map_center_lat ?? 0;
  const mapLonValue = mapLon ?? data?.map_center_lon ?? 0;
  const directoryValue = directoryVisible ?? data?.user_directory_visible ?? false;

  const save = useMutation({
    mutationFn: () =>
      api.patch<RegistrationSettings>('/api/admin/settings', {
        invite_code: codeValue,
        contact_email: emailValue,
        site_name: nameValue,
        public_page: publicValue,
        login_message: loginMessageValue,
        map_center_lat: Number(mapLatValue),
        map_center_lon: Number(mapLonValue),
        user_directory_visible: directoryValue,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['auth', 'config'] });
      setCode(null);
      setEmail(null);
      setName(null);
      setPublicPage(null);
      setLoginMessage(null);
      setMapLat(null);
      setMapLon(null);
      setDirectoryVisible(null);
      notifications.show({ message: t('admin.settingsSaved'), color: 'green' });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('admin.couldNotSave'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  const closed = (data?.invite_code ?? '') === '';

  return (
    <Card withBorder p="lg">
      <Group justify="space-between" mb="xs">
        <Title order={3}>{t('admin.registrationTitle')}</Title>
        {closed ? (
          <Badge color="red" variant="light">
            {t('admin.signupClosed')}
          </Badge>
        ) : (
          <Badge color="green" variant="light">
            {t('admin.signupOpen')}
          </Badge>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        {t('admin.registrationDescription')}
      </Text>
      <Stack>
        <TextInput
          label={t('admin.accessCodeLabel')}
          placeholder={t('admin.accessCodePlaceholder')}
          value={codeValue}
          onChange={(e) => setCode(e.currentTarget.value)}
        />
        <TextInput
          label={t('admin.contactEmailLabel')}
          placeholder={t('admin.contactEmailPlaceholder')}
          value={emailValue}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <TextInput
          label={t('admin.communityNameLabel')}
          description={t('admin.communityNameDescription')}
          placeholder={t('admin.communityNamePlaceholder')}
          value={nameValue}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Switch
          label={t('admin.publicImpactPageLabel')}
          description={
            <Trans
              i18nKey="admin.publicImpactPageDescription"
              components={{ link: <Anchor href="/impact" target="_blank" size="xs" /> }}
            />
          }
          checked={publicValue}
          onChange={(e) => setPublicPage(e.currentTarget.checked)}
        />
        <Switch
          label={t('admin.memberDirectoryLabel')}
          description={t('admin.memberDirectoryDescription')}
          checked={directoryValue}
          onChange={(e) => setDirectoryVisible(e.currentTarget.checked)}
        />
        <Textarea
          label={t('admin.loginMessageLabel')}
          description={t('admin.loginMessageDescription')}
          placeholder={t('admin.loginMessagePlaceholder')}
          minRows={2}
          autosize
          maxRows={8}
          value={loginMessageValue}
          onChange={(e) => setLoginMessage(e.currentTarget.value)}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t('admin.mapStartingPointTitle')}
          </Text>
          <Text size="xs" c="dimmed" mb={8}>
            {t('admin.mapStartingPointDescription')}
          </Text>
          <Group grow>
            <NumberInput
              label={t('admin.latitudeLabel')}
              min={-90}
              max={90}
              decimalScale={4}
              value={mapLatValue}
              onChange={setMapLat}
            />
            <NumberInput
              label={t('admin.longitudeLabel')}
              min={-180}
              max={180}
              decimalScale={4}
              value={mapLonValue}
              onChange={setMapLon}
            />
          </Group>
        </div>
        <Group justify="flex-end">
          <Button
            variant="gradient"
            loading={save.isPending}
            disabled={
              code === null &&
              email === null &&
              name === null &&
              publicPage === null &&
              loginMessage === null &&
              mapLat === null &&
              mapLon === null &&
              directoryVisible === null
            }
            onClick={() => save.mutate()}
          >
            {t('admin.save')}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function EmailCell({ user, disabled }: { user: User; disabled: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.email);

  const save = useMutation({
    mutationFn: () => api.patch<User>(`/api/admin/users/${user.id}`, { email: value.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setEditing(false);
      notifications.show({ message: t('admin.emailUpdated'), color: 'green' });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('admin.couldNotUpdateEmail'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  if (!editing) {
    return (
      <Group gap={6} wrap="nowrap">
        <span>{user.email}</span>
        {!disabled && (
          <Tooltip label={t('admin.changeEmailTooltip')}>
            <ActionIcon variant="subtle" size="sm" onClick={() => { setValue(user.email); setEditing(true); }}>
              <IconPencil size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    );
  }
  return (
    <Group gap={6} wrap="nowrap">
      <TextInput
        size="xs"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        w={220}
        autoFocus
      />
      <ActionIcon color="green" variant="light" size="sm" loading={save.isPending} onClick={() => save.mutate()}>
        <IconCheck size={14} />
      </ActionIcon>
      <ActionIcon color="gray" variant="light" size="sm" onClick={() => setEditing(false)}>
        <IconX size={14} />
      </ActionIcon>
    </Group>
  );
}

function MergeUserModal({
  source,
  onClose,
  onMerged,
}: {
  source: User | null;
  onClose: () => void;
  onMerged: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['admin', 'users', 'mergepick', q],
    queryFn: () => api.get<Paginated<User>>('/api/admin/users', { q: q || undefined, page_size: 8 }),
    enabled: !!source,
  });

  const merge = useMutation({
    mutationFn: (intoId: number) =>
      api.post<User>(`/api/admin/users/${source!.id}/merge`, { into_id: intoId }),
    onSuccess: (target) => {
      onMerged();
      onClose();
      notifications.show({
        color: 'green',
        message: t('admin.mergedNotification', { source: source!.name, target: target.name }),
      });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('admin.mergeFailed'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  const candidates = (data?.items ?? []).filter((u) => u.id !== source?.id);

  return (
    <Modal
      opened={!!source}
      onClose={onClose}
      title={t('admin.mergeModalTitle', { name: source?.name ?? '' })}
      size="md"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t('admin.mergeModalDescription', { name: source?.name })}
        </Text>
        <TextInput
          placeholder={t('admin.mergeSearchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        <Stack gap="xs">
          {candidates.map((u) => (
            <Group key={u.id} justify="space-between" wrap="nowrap">
              <div>
                <Text size="sm" fw={500}>
                  {u.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {u.email}
                </Text>
              </div>
              <Button
                size="xs"
                variant="light"
                loading={merge.isPending && merge.variables === u.id}
                onClick={() => {
                  if (window.confirm(t('admin.confirmMerge', { source: source?.name, target: u.name })))
                    merge.mutate(u.id);
                }}
              >
                {t('admin.mergeHereButton')}
              </Button>
            </Group>
          ))}
          {candidates.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="sm">
              {t('admin.noOtherAccountsMatch')}
            </Text>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}

export function AdminPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [resetInfo, setResetInfo] = useState<{ name: string; password: string } | null>(null);
  const [resetOpen, reset] = useDisclosure(false);
  const [mergeSource, setMergeSource] = useState<User | null>(null);
  const [q, setQ] = useState('');
  const [venueFilter, setVenueFilter] = useState<number | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const params = {
    q: q || undefined,
    venue_id: venueFilter ?? undefined,
    language: languageFilter ?? undefined,
    page,
    page_size: PAGE_SIZE,
  };
  const { data } = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => api.get<Paginated<AdminUser>>('/api/admin/users', params),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { is_active?: boolean; is_admin?: boolean } }) =>
      api.patch<User>(`/api/admin/users/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('admin.updateFailed'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  const resetPassword = useMutation({
    mutationFn: (user: User) =>
      api
        .post<PasswordResetResult>(`/api/admin/users/${user.id}/reset-password`)
        .then((r) => ({ name: user.name, password: r.temporary_password })),
    onSuccess: (info) => {
      setResetInfo(info);
      reset.open();
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('admin.resetFailed'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  const removeUser = useMutation({
    mutationFn: (user: User) => api.delete(`/api/admin/users/${user.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      notifications.show({ message: t('admin.userDeleted') });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('admin.couldNotDeleteUser'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  const total = data?.total ?? 0;

  return (
    <Stack>
      <Title order={2}>{t('admin.title')}</Title>
      <RegistrationCard />
      <SiteSetupCard />
      <DbToolsCard />
      <BackupsCard />
      <InstitutionImportCard />
      <InstitutionManagerCard />

      <Group justify="space-between" align="flex-end" mt="md" wrap="wrap">
        <Title order={3}>{t('admin.userManagementHeading')}</Title>
        <Group align="flex-end">
          <TextInput
            placeholder={t('admin.searchPlaceholder')}
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
            w={220}
          />
          <VenueFilterSelect
            value={venueFilter}
            onChange={(v) => {
              setVenueFilter(v);
              setPage(1);
            }}
          />
          <Select
            placeholder={t('admin.filterByLanguagePlaceholder')}
            searchable
            clearable
            data={LANGUAGES}
            value={languageFilter}
            onChange={(v) => {
              setLanguageFilter(v);
              setPage(1);
            }}
            w={200}
          />
        </Group>
      </Group>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={780}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('admin.nameHeader')}</Table.Th>
                <Table.Th>{t('admin.emailHeader')}</Table.Th>
                <Table.Th>{t('admin.affiliationHeader')}</Table.Th>
                <Table.Th>{t('admin.schoolsHeader')}</Table.Th>
                <Table.Th>{t('admin.languagesHeader')}</Table.Th>
                <Table.Th>{t('admin.joinedHeader')}</Table.Th>
                <Table.Th>{t('admin.activeHeader')}</Table.Th>
                <Table.Th>{t('admin.adminHeader')}</Table.Th>
                <Table.Th>{t('admin.actionsHeader')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.items ?? []).map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    {user.name}{' '}
                    {user.id === me?.id && (
                      <Badge size="xs" variant="light">
                        {t('admin.youBadge')}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <EmailCell user={user} disabled={false} />
                  </Table.Td>
                  <Table.Td>{user.affiliation ?? '—'}</Table.Td>
                  <Table.Td>
                    {user.schools.length > 0 ? (
                      <Group gap={4}>
                        {user.schools.map((s) => (
                          <Badge key={s.id} size="xs" variant="light">
                            {s.name}
                          </Badge>
                        ))}
                      </Group>
                    ) : (
                      '—'
                    )}
                  </Table.Td>
                  <Table.Td>
                    {user.languages_spoken.length > 0 ? user.languages_spoken.join(', ') : '—'}
                  </Table.Td>
                  <Table.Td>{new Date(user.created_at).toLocaleDateString()}</Table.Td>
                  <Table.Td>
                    <Switch
                      checked={user.is_active}
                      disabled={user.id === me?.id}
                      onChange={(e) =>
                        update.mutate({ id: user.id, patch: { is_active: e.currentTarget.checked } })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Switch
                      checked={user.is_admin}
                      disabled={user.id === me?.id}
                      onChange={(e) =>
                        update.mutate({ id: user.id, patch: { is_admin: e.currentTarget.checked } })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Menu shadow="md" position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="default" aria-label={t('admin.userActionsAriaLabel')}>
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconKey size={14} />}
                          onClick={() => resetPassword.mutate(user)}
                        >
                          {t('admin.resetPasswordMenuItem')}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconGitMerge size={14} />}
                          disabled={user.id === me?.id}
                          onClick={() => setMergeSource(user)}
                        >
                          {t('admin.mergeIntoMenuItem')}
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          disabled={user.id === me?.id}
                          onClick={() => {
                            if (window.confirm(t('admin.confirmDeleteUser', { name: user.name }))) {
                              removeUser.mutate(user);
                            }
                          }}
                        >
                          {t('admin.deleteUserMenuItem')}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
              {(data?.items.length ?? 0) === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={9}>
                    <Text c="dimmed" ta="center" py="lg">
                      {t('admin.noUsersMatch', { q })}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t('admin.userCount', { count: total, formattedCount: total.toLocaleString() })}
        </Text>
        <Pagination
          value={page}
          onChange={setPage}
          total={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        />
      </Group>
      <Text size="sm" c="dimmed">
        {t('admin.deactivatedUsersNote')}
      </Text>

      <MergeUserModal
        source={mergeSource}
        onClose={() => setMergeSource(null)}
        onMerged={() => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })}
      />

      <Modal opened={resetOpen} onClose={reset.close} title={t('admin.tempPasswordModalTitle')} size="md">
        <Stack>
          <Text size="sm">
            <Trans
              i18nKey="admin.tempPasswordBody"
              values={{ name: resetInfo?.name }}
              components={{ bold: <b /> }}
            />
          </Text>
          <Group>
            <Code fz="md" p="xs">
              {resetInfo?.password}
            </Code>
            <CopyButton value={resetInfo?.password ?? ''}>
              {({ copied, copy }) => (
                <Button variant="light" onClick={copy}>
                  {copied ? t('admin.copiedButton') : t('admin.copyButton')}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
