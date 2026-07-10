import {
  Button,
  Card,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { StatsSummary, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export function ProfilePage() {
  const { user, refresh } = useAuth();

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

  const profileForm = useForm({
    initialValues: { name: user?.name ?? '', affiliation: user?.affiliation ?? '' },
    validate: { name: (v) => (v.trim().length > 0 ? null : 'Name is required') },
  });

  const passwordForm = useForm({
    initialValues: { current_password: '', new_password: '' },
    validate: {
      current_password: (v) => (v ? null : 'Required'),
      new_password: (v) => (v.length >= 8 ? null : 'At least 8 characters'),
    },
  });

  const saveProfile = useMutation({
    mutationFn: (values: { name: string; affiliation: string }) =>
      api.patch<User>('/api/users/me', {
        name: values.name.trim(),
        affiliation: values.affiliation.trim(),
      }),
    onSuccess: async () => {
      await refresh();
      notifications.show({ message: 'Profile updated' });
    },
  });

  const changePassword = useMutation({
    mutationFn: (values: { current_password: string; new_password: string }) =>
      api.patch<User>('/api/users/me', values),
    onSuccess: () => {
      passwordForm.reset();
      notifications.show({ message: 'Password changed' });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Could not change password',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  if (!user) return null;

  return (
    <Stack maw={640} mx="auto">
      <Title order={2}>Profile</Title>

      <Group grow>
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Your visits
          </Text>
          <Text fz={28} fw={700}>
            {myStats ?? '—'}
          </Text>
        </Card>
        <Card withBorder p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Community visits
          </Text>
          <Text fz={28} fw={700}>
            {community?.total_visits ?? '—'}
          </Text>
        </Card>
      </Group>

      <Card withBorder p="lg">
        <form onSubmit={profileForm.onSubmit((values) => saveProfile.mutate(values))}>
          <Stack>
            <TextInput label="Email" value={user.email} disabled />
            <TextInput label="Full name" {...profileForm.getInputProps('name')} />
            <TextInput label="Affiliation" {...profileForm.getInputProps('affiliation')} />
            <Group justify="flex-end">
              <Button type="submit" loading={saveProfile.isPending}>
                Save profile
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>

      <Card withBorder p="lg">
        <form onSubmit={passwordForm.onSubmit((values) => changePassword.mutate(values))}>
          <Stack>
            <Title order={4}>Change password</Title>
            <PasswordInput
              label="Current password"
              {...passwordForm.getInputProps('current_password')}
            />
            <PasswordInput label="New password" {...passwordForm.getInputProps('new_password')} />
            <Group justify="flex-end">
              <Button type="submit" loading={changePassword.isPending}>
                Change password
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
