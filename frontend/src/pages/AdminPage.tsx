import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  Pagination,
  Stack,
  Switch,
  Table,
  Text,
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
import { api, ApiError } from '../api/client';
import type { Paginated, PasswordResetResult, RegistrationSettings, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { BackupsCard } from '../components/BackupsCard';
import { InstitutionImportCard } from '../components/InstitutionImportCard';
import { InstitutionManagerCard } from '../components/InstitutionManagerCard';
import { SiteSetupCard } from '../components/SiteSetupCard';

const PAGE_SIZE = 25;

function RegistrationCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<RegistrationSettings>('/api/admin/settings'),
  });
  const [code, setCode] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const codeValue = code ?? data?.invite_code ?? '';
  const emailValue = email ?? data?.contact_email ?? '';

  const save = useMutation({
    mutationFn: () =>
      api.patch<RegistrationSettings>('/api/admin/settings', {
        invite_code: codeValue,
        contact_email: emailValue,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['auth', 'config'] });
      setCode(null);
      setEmail(null);
      notifications.show({ message: 'Registration settings saved', color: 'green' });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Could not save',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  const closed = (data?.invite_code ?? '') === '';

  return (
    <Card withBorder p="lg">
      <Group justify="space-between" mb="xs">
        <Title order={3}>Registration</Title>
        {closed ? (
          <Badge color="red" variant="light">
            Sign-up closed
          </Badge>
        ) : (
          <Badge color="green" variant="light">
            Open with access code
          </Badge>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        New accounts require this access code. Share it only with people you want to let in;
        clear it to close sign-up entirely. The contact email is shown on the login and
        register pages so people know where to request a code or a password reset.
      </Text>
      <Stack>
        <TextInput
          label="Access code"
          placeholder="Required to register (empty = closed)"
          value={codeValue}
          onChange={(e) => setCode(e.currentTarget.value)}
        />
        <TextInput
          label="Contact email"
          placeholder="outreach@your-org.edu"
          value={emailValue}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            variant="gradient"
            loading={save.isPending}
            disabled={code === null && email === null}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function EmailCell({ user, disabled }: { user: User; disabled: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.email);

  const save = useMutation({
    mutationFn: () => api.patch<User>(`/api/admin/users/${user.id}`, { email: value.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setEditing(false);
      notifications.show({ message: 'Email updated', color: 'green' });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Could not update email',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  if (!editing) {
    return (
      <Group gap={6} wrap="nowrap">
        <span>{user.email}</span>
        {!disabled && (
          <Tooltip label="Change email">
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
        message: `Merged ${source!.name} into ${target.name}`,
      });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Merge failed',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  const candidates = (data?.items ?? []).filter((u) => u.id !== source?.id);

  return (
    <Modal opened={!!source} onClose={onClose} title={`Merge ${source?.name ?? ''} into…`} size="md">
      <Stack>
        <Text size="sm" c="dimmed">
          All of {source?.name}’s visits and venues move to the account you pick, then{' '}
          {source?.name}’s account is deleted. This can’t be undone.
        </Text>
        <TextInput
          placeholder="Search the destination account"
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
                  if (window.confirm(`Merge ${source?.name} into ${u.name}?`)) merge.mutate(u.id);
                }}
              >
                Merge here
              </Button>
            </Group>
          ))}
          {candidates.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="sm">
              No other accounts match.
            </Text>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}

export function AdminPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [resetInfo, setResetInfo] = useState<{ name: string; password: string } | null>(null);
  const [resetOpen, reset] = useDisclosure(false);
  const [mergeSource, setMergeSource] = useState<User | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const params = { q: q || undefined, page, page_size: PAGE_SIZE };
  const { data } = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => api.get<Paginated<User>>('/api/admin/users', params),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { is_active?: boolean; is_admin?: boolean } }) =>
      api.patch<User>(`/api/admin/users/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
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
        title: 'Reset failed',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  const removeUser = useMutation({
    mutationFn: (user: User) => api.delete(`/api/admin/users/${user.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      notifications.show({ message: 'User deleted' });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Could not delete user',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  const total = data?.total ?? 0;

  return (
    <Stack>
      <Title order={2}>Admin</Title>
      <RegistrationCard />
      <SiteSetupCard />
      <BackupsCard />
      <InstitutionImportCard />
      <InstitutionManagerCard />

      <Group justify="space-between" align="flex-end" mt="md">
        <Title order={3}>User management</Title>
        <TextInput
          placeholder="Search name or email"
          value={q}
          onChange={(e) => {
            setQ(e.currentTarget.value);
            setPage(1);
          }}
          w={280}
        />
      </Group>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={780}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Affiliation</Table.Th>
                <Table.Th>Joined</Table.Th>
                <Table.Th>Active</Table.Th>
                <Table.Th>Admin</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.items ?? []).map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    {user.name}{' '}
                    {user.id === me?.id && (
                      <Badge size="xs" variant="light">
                        you
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <EmailCell user={user} disabled={false} />
                  </Table.Td>
                  <Table.Td>{user.affiliation ?? '—'}</Table.Td>
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
                        <ActionIcon variant="default" aria-label="User actions">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconKey size={14} />}
                          onClick={() => resetPassword.mutate(user)}
                        >
                          Reset password
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconGitMerge size={14} />}
                          disabled={user.id === me?.id}
                          onClick={() => setMergeSource(user)}
                        >
                          Merge into…
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          disabled={user.id === me?.id}
                          onClick={() => {
                            if (window.confirm(`Delete ${user.name}? This cannot be undone.`)) {
                              removeUser.mutate(user);
                            }
                          }}
                        >
                          Delete user
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
              {(data?.items.length ?? 0) === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="lg">
                      No users match “{q}”.
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
          {total.toLocaleString()} user{total === 1 ? '' : 's'}
        </Text>
        <Pagination
          value={page}
          onChange={setPage}
          total={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        />
      </Group>
      <Text size="sm" c="dimmed">
        Deactivated users can no longer log in, but their visits stay in the community record.
      </Text>

      <MergeUserModal
        source={mergeSource}
        onClose={() => setMergeSource(null)}
        onMerged={() => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })}
      />

      <Modal opened={resetOpen} onClose={reset.close} title="Temporary password" size="md">
        <Stack>
          <Text size="sm">
            Share this one-time password with <b>{resetInfo?.name}</b> over a secure channel.
            They should log in and change it from their profile. It is shown only once.
          </Text>
          <Group>
            <Code fz="md" p="xs">
              {resetInfo?.password}
            </Code>
            <CopyButton value={resetInfo?.password ?? ''}>
              {({ copied, copy }) => (
                <Button variant="light" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
