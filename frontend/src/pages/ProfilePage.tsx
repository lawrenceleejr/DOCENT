import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  MultiSelect,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { LANGUAGES, type School, type StatsSummary, type User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { VenuePicker } from '../components/VenuePicker';

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [newSchoolId, setNewSchoolId] = useState<number | null>(null);

  const { data: myStats } = useQuery({
    queryKey: ['stats', 'mine', user?.id],
    queryFn: async () => {
      const visits = await api.get<{ total: number }>('/api/visits', {
        author_id: user!.id,
        page_size: 1,
      });
      return visits.total;
    },
    enabled: !!user,
  });
  const { data: community } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: () => api.get<StatsSummary>('/api/stats/summary'),
  });
  const { data: schools = [] } = useQuery({
    queryKey: ['users', 'me', 'schools'],
    queryFn: () => api.get<School[]>('/api/users/me/schools'),
    enabled: !!user,
  });

  const profileForm = useForm({
    initialValues: {
      name: user?.name ?? '',
      affiliation: user?.affiliation ?? '',
      position: user?.position ?? '',
      languages_spoken: user?.languages_spoken ?? [],
    },
    validate: { name: (v) => (v.trim().length > 0 ? null : t('profile.validation.nameRequired')) },
  });

  const passwordForm = useForm({
    initialValues: { current_password: '', new_password: '' },
    validate: {
      current_password: (v) => (v ? null : t('profile.validation.currentPasswordRequired')),
      new_password: (v) => (v.length >= 8 ? null : t('profile.validation.passwordMin')),
    },
  });

  const saveProfile = useMutation({
    mutationFn: (values: {
      name: string;
      affiliation: string;
      position: string;
      languages_spoken: string[];
    }) =>
      api.patch<User>('/api/users/me', {
        name: values.name.trim(),
        affiliation: values.affiliation.trim(),
        position: values.position.trim(),
        languages_spoken: values.languages_spoken,
      }),
    onSuccess: async () => {
      await refresh();
      notifications.show({ message: t('profile.profileUpdated') });
    },
  });

  const changePassword = useMutation({
    mutationFn: (values: { current_password: string; new_password: string }) =>
      api.patch<User>('/api/users/me', values),
    onSuccess: () => {
      passwordForm.reset();
      notifications.show({ message: t('profile.passwordChanged') });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('profile.couldNotChangePassword'),
        message: e instanceof ApiError ? e.message : t('profile.unexpectedError'),
      });
    },
  });

  const addSchool = useMutation({
    mutationFn: (venueId: number) =>
      api.post<School>('/api/users/me/schools', { venue_id: venueId }),
    onSuccess: () => {
      setNewSchoolId(null);
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'schools'] });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('profile.couldNotAddSchool'),
        message: e instanceof ApiError ? e.message : t('profile.unexpectedError'),
      });
    },
  });

  const removeSchool = useMutation({
    mutationFn: (schoolId: number) => api.delete(`/api/users/me/schools/${schoolId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'schools'] });
    },
  });

  if (!user) return null;

  return (
    <Stack maw={640} mx="auto">
      <Title order={2}>{t('profile.title')}</Title>

      <Group grow>
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('profile.yourVisits')}
          </Text>
          <Text fz={28} fw={700}>
            {myStats ?? '—'}
          </Text>
        </Card>
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('profile.communityVisits')}
          </Text>
          <Text fz={28} fw={700}>
            {community?.total_visits ?? '—'}
          </Text>
        </Card>
      </Group>

      <Card withBorder p="lg">
        <form onSubmit={profileForm.onSubmit((values) => saveProfile.mutate(values))}>
          <Stack>
            <TextInput label={t('profile.emailLabel')} value={user.email} disabled />
            <TextInput label={t('profile.fullNameLabel')} {...profileForm.getInputProps('name')} />
            <TextInput
              label={t('profile.affiliationLabel')}
              {...profileForm.getInputProps('affiliation')}
            />
            <TextInput
              label={t('profile.positionLabel')}
              placeholder={t('profile.positionPlaceholder')}
              {...profileForm.getInputProps('position')}
            />
            <MultiSelect
              label={t('profile.languagesLabel')}
              placeholder={t('profile.languagesPlaceholder')}
              searchable
              clearable
              data={LANGUAGES}
              {...profileForm.getInputProps('languages_spoken')}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={saveProfile.isPending}>
                {t('profile.saveProfile')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>

      <Card withBorder p="lg">
        <Stack gap="sm">
          <div>
            <Title order={4}>{t('profile.schoolsTitle')}</Title>
            <Text size="sm" c="dimmed">
              {t('profile.schoolsDescription')}
            </Text>
          </div>
          {schools.length > 0 && (
            <Group gap={6}>
              {schools.map((school) => (
                <Badge
                  key={school.id}
                  variant="light"
                  size="lg"
                  rightSection={
                    <ActionIcon
                      size="xs"
                      color="gray"
                      variant="transparent"
                      aria-label={t('profile.removeSchoolAria', { name: school.venue.name })}
                      onClick={() => removeSchool.mutate(school.id)}
                    >
                      <IconTrash size={12} />
                    </ActionIcon>
                  }
                >
                  {school.venue.name}
                  {school.venue.city ? ` — ${school.venue.city}` : ''}
                </Badge>
              ))}
            </Group>
          )}
          <Group align="flex-end">
            <div style={{ flex: 1 }}>
              <VenuePicker value={newSchoolId} onChange={setNewSchoolId} />
            </div>
            <Button
              disabled={newSchoolId === null}
              loading={addSchool.isPending}
              onClick={() => newSchoolId !== null && addSchool.mutate(newSchoolId)}
            >
              {t('profile.add')}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder p="lg">
        <form onSubmit={passwordForm.onSubmit((values) => changePassword.mutate(values))}>
          <Stack>
            <Title order={4}>{t('profile.changePassword')}</Title>
            <PasswordInput
              label={t('profile.currentPasswordLabel')}
              autoComplete="current-password"
              {...passwordForm.getInputProps('current_password')}
            />
            <PasswordInput
              label={t('profile.newPasswordLabel')}
              autoComplete="new-password"
              {...passwordForm.getInputProps('new_password')}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={changePassword.isPending}>
                {t('profile.changePassword')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
