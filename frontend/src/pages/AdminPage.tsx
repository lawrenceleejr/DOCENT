import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Group,
  List,
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
  IconCopy,
  IconDots,
  IconInfoCircle,
  IconGitMerge,
  IconKey,
  IconPencil,
  IconTrash,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import {
  CARTO_APIKEY_URL,
  CARTO_ATTRIBUTION,
  CARTO_DARK_URL,
  CARTO_LIGHT_URL,
  DEFAULT_LIGHT_URL,
} from '../lib/basemap';
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
import { GettingStartedCard } from '../components/GettingStartedCard';
import { TagsCard } from '../components/TagsCard';
import { LoginHistoryCard } from '../components/LoginHistoryCard';
import { InstitutionImportCard } from '../components/InstitutionImportCard';
import { InstitutionManagerCard } from '../components/InstitutionManagerCard';
import { SiteSetupCard } from '../components/SiteSetupCard';
import { AnalyticsCard } from '../components/AnalyticsCard';
import { DbToolsCard } from '../components/DbToolsCard';
import { FederationCard } from '../components/FederationCard';
import { VenueFilterSelect } from '../components/VenueFilterSelect';

const PAGE_SIZE = 25;

/** One of the ready-made CARTO values, with a copy-to-clipboard button. */
function BasemapSnippet({ label, text }: { label: string; text: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <Group justify="space-between" mb={2} wrap="nowrap">
        <Text size="xs" fw={600}>
          {label}
        </Text>
        <CopyButton value={text} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip
              label={copied ? t('siteSetupCard.copiedTooltip') : t('siteSetupCard.copyTooltip')}
              withArrow
            >
              <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
      <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11 }}>
        {text}
      </Code>
    </div>
  );
}


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
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [bannerLevel, setBannerLevel] = useState<string | null>(null);
  const [mapLat, setMapLat] = useState<number | string | null>(null);
  const [mapLon, setMapLon] = useState<number | string | null>(null);
  const [mapRadius, setMapRadius] = useState<number | string | null>(null);
  const [directoryVisible, setDirectoryVisible] = useState<boolean | null>(null);
  const [basemapLight, setBasemapLight] = useState<string | null>(null);
  const [basemapDark, setBasemapDark] = useState<string | null>(null);
  const [basemapAttribution, setBasemapAttribution] = useState<string | null>(null);
  const [basemapMonochrome, setBasemapMonochrome] = useState<boolean | null>(null);

  const codeValue = code ?? data?.invite_code ?? '';
  const emailValue = email ?? data?.contact_email ?? '';
  const nameValue = name ?? data?.site_name ?? '';
  const publicValue = publicPage ?? data?.public_page ?? false;
  const loginMessageValue = loginMessage ?? data?.login_message ?? '';
  const bannerMessageValue = bannerMessage ?? data?.banner_message ?? '';
  const bannerLevelValue = bannerLevel ?? data?.banner_level ?? 'info';
  const mapLatValue = mapLat ?? data?.map_center_lat ?? 0;
  const mapLonValue = mapLon ?? data?.map_center_lon ?? 0;
  const mapRadiusValue = mapRadius ?? data?.map_radius_km ?? 80;
  const directoryValue = directoryVisible ?? data?.user_directory_visible ?? false;
  const basemapLightValue = basemapLight ?? data?.basemap_light_url ?? '';
  const basemapDarkValue = basemapDark ?? data?.basemap_dark_url ?? '';
  const basemapAttributionValue = basemapAttribution ?? data?.basemap_attribution ?? '';
  const basemapMonochromeValue = basemapMonochrome ?? data?.basemap_monochrome ?? true;

  const save = useMutation({
    mutationFn: () =>
      api.patch<RegistrationSettings>('/api/admin/settings', {
        invite_code: codeValue,
        contact_email: emailValue,
        site_name: nameValue,
        public_page: publicValue,
        login_message: loginMessageValue,
        banner_message: bannerMessageValue,
        banner_level: bannerLevelValue as 'info' | 'warning' | 'critical',
        map_center_lat: Number(mapLatValue),
        map_center_lon: Number(mapLonValue),
        map_radius_km: Number(mapRadiusValue),
        user_directory_visible: directoryValue,
        basemap_light_url: basemapLightValue,
        basemap_dark_url: basemapDarkValue,
        basemap_attribution: basemapAttributionValue,
        basemap_monochrome: basemapMonochromeValue,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['auth', 'config'] });
      setCode(null);
      setEmail(null);
      setName(null);
      setPublicPage(null);
      setLoginMessage(null);
      setBannerMessage(null);
      setBannerLevel(null);
      setMapLat(null);
      setMapLon(null);
      setMapRadius(null);
      setBasemapLight(null);
      setBasemapDark(null);
      setBasemapAttribution(null);
      setBasemapMonochrome(null);
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
        <Textarea
          label={t('admin.bannerMessageLabel')}
          description={t('admin.bannerMessageDescription')}
          placeholder={t('admin.bannerMessagePlaceholder')}
          minRows={2}
          autosize
          maxRows={6}
          value={bannerMessageValue}
          onChange={(e) => setBannerMessage(e.currentTarget.value)}
        />
        <Select
          label={t('admin.bannerLevelLabel')}
          data={[
            { value: 'info', label: t('admin.bannerLevelInfo') },
            { value: 'warning', label: t('admin.bannerLevelWarning') },
            { value: 'critical', label: t('admin.bannerLevelCritical') },
          ]}
          value={bannerLevelValue}
          onChange={(v) => setBannerLevel(v ?? 'info')}
          allowDeselect={false}
          w={240}
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
            <NumberInput
              label={t('admin.radiusLabel')}
              min={1}
              max={20000}
              value={mapRadiusValue}
              onChange={setMapRadius}
            />
          </Group>
        </div>
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t('admin.basemapTitle')}
          </Text>
          <Text size="xs" c="dimmed" mb={8}>
            {t('admin.basemapDescription')}
          </Text>
          <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />} mb="sm">
            <Text size="sm" fw={600} mb={6}>
              {t('admin.basemapCartoTitle')}
            </Text>
            <List size="sm" spacing={4} type="ordered">
              <List.Item>
                <Trans
                  i18nKey="admin.basemapCartoStep1"
                  components={{
                    cartoLink: (
                      <Anchor href={CARTO_APIKEY_URL} target="_blank" rel="noreferrer" />
                    ),
                  }}
                />
              </List.Item>
              <List.Item>{t('admin.basemapCartoStep2')}</List.Item>
              <List.Item>{t('admin.basemapCartoStep3')}</List.Item>
              <List.Item>{t('admin.basemapCartoStep4')}</List.Item>
            </List>
            <Stack gap={6} mt="sm">
              <BasemapSnippet label={t('admin.basemapCartoLightLabel')} text={CARTO_LIGHT_URL} />
              <BasemapSnippet label={t('admin.basemapCartoDarkLabel')} text={CARTO_DARK_URL} />
              <BasemapSnippet
                label={t('admin.basemapCartoAttributionLabel')}
                text={CARTO_ATTRIBUTION}
              />
            </Stack>
            <Text size="xs" c="dimmed" mt="sm">
              {t('admin.basemapCartoNote')}
            </Text>
          </Alert>
          <Stack gap="xs">
            <TextInput
              label={t('admin.basemapLightLabel')}
              description={t('admin.basemapLightDescription')}
              placeholder={DEFAULT_LIGHT_URL}
              value={basemapLightValue}
              onChange={(e) => setBasemapLight(e.currentTarget.value)}
            />
            <TextInput
              label={t('admin.basemapDarkLabel')}
              description={t('admin.basemapDarkDescription')}
              value={basemapDarkValue}
              onChange={(e) => setBasemapDark(e.currentTarget.value)}
            />
            <TextInput
              label={t('admin.basemapAttributionLabel')}
              description={t('admin.basemapAttributionDescription')}
              value={basemapAttributionValue}
              onChange={(e) => setBasemapAttribution(e.currentTarget.value)}
            />
            <Switch
              label={t('admin.basemapMonochromeLabel')}
              description={t('admin.basemapMonochromeDescription')}
              checked={basemapMonochromeValue}
              onChange={(e) => setBasemapMonochrome(e.currentTarget.checked)}
            />
          </Stack>
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
              bannerMessage === null &&
              bannerLevel === null &&
              mapLat === null &&
              mapLon === null &&
              mapRadius === null &&
              directoryVisible === null &&
              basemapLight === null &&
              basemapDark === null &&
              basemapAttribution === null &&
              basemapMonochrome === null
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

/**
 * Open an account for someone who won't sign up themselves — the senior
 * colleague who won't log into a thing, but whose outreach still belongs in
 * the record. No password is chosen: the account is created unreachable, and
 * "Reset password" on its row is what hands it over.
 */
function AddUserModal({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (user: User) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [position, setPosition] = useState('');

  const clear = () => {
    setName('');
    setEmail('');
    setAffiliation('');
    setPosition('');
  };

  const create = useMutation({
    mutationFn: () =>
      api.post<User>('/api/admin/users', {
        name: name.trim(),
        email: email.trim(),
        affiliation: affiliation.trim() || null,
        position: position.trim() || null,
      }),
    onSuccess: (user) => {
      clear();
      onCreated(user);
      onClose();
      notifications.show({
        color: 'green',
        title: t('admin.userCreatedTitle'),
        message: t('admin.userCreatedMessage', { name: user.name }),
      });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('admin.createUserFailed'),
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      });
    },
  });

  const valid = name.trim().length > 0 && /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <Modal
      opened={opened}
      onClose={() => {
        clear();
        onClose();
      }}
      title={t('admin.addUserModalTitle')}
      size="md"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t('admin.addUserModalDescription')}
        </Text>
        <TextInput
          label={t('admin.addUserNameLabel')}
          withAsterisk
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <TextInput
          label={t('admin.addUserEmailLabel')}
          description={t('admin.addUserEmailDescription')}
          withAsterisk
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <TextInput
          label={t('admin.addUserAffiliationLabel')}
          value={affiliation}
          onChange={(e) => setAffiliation(e.currentTarget.value)}
        />
        <TextInput
          label={t('admin.addUserPositionLabel')}
          value={position}
          onChange={(e) => setPosition(e.currentTarget.value)}
        />
        <Alert variant="light" color="blue" icon={<IconKey size={16} />}>
          {t('admin.addUserNoPasswordNote')}
        </Alert>
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              clear();
              onClose();
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            {t('admin.addUserSubmit')}
          </Button>
        </Group>
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
  const [addUserOpen, addUser] = useDisclosure(false);
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
      <GettingStartedCard />
      <RegistrationCard />
      <SiteSetupCard />
      <AnalyticsCard />
      <DbToolsCard />
      <FederationCard />
      <BackupsCard />
      <TagsCard />
      <InstitutionImportCard />
      <InstitutionManagerCard />

      <Group justify="space-between" align="flex-end" mt="md" wrap="wrap">
        <Title order={3}>{t('admin.userManagementHeading')}</Title>
        <Group align="flex-end">
          <Button
            variant="default"
            leftSection={<IconUserPlus size={16} />}
            onClick={addUser.open}
          >
            {t('admin.addUserButton')}
          </Button>
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
                <Table.Th>{t('admin.positionHeader')}</Table.Th>
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
                  <Table.Td>{user.position ?? '—'}</Table.Td>
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
                  <Table.Td colSpan={10}>
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

      {/* Login history lives at the very bottom, collapsed by default (#30). */}
      <LoginHistoryCard />

      <AddUserModal
        opened={addUserOpen}
        onClose={addUser.close}
        onCreated={(user) => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
          // Users page oldest-first, so a new one lands on the last page —
          // filter to them instead, ready for "Reset password" on their row.
          setQ(user.email);
          setVenueFilter(null);
          setLanguageFilter(null);
          setPage(1);
        }}
      />

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
