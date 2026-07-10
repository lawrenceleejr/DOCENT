import { Badge, Card, Stack, Switch, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export function AdminPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();

  const { data: users } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<User[]>('/api/admin/users'),
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

  return (
    <Stack>
      <Title order={2}>User management</Title>
      <Card withBorder p={0}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Affiliation</Table.Th>
              <Table.Th>Joined</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th>Admin</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(users ?? []).map((user) => (
              <Table.Tr key={user.id}>
                <Table.Td>
                  {user.name}{' '}
                  {user.id === me?.id && (
                    <Badge size="xs" variant="light">
                      you
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{user.email}</Table.Td>
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
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <Text size="sm" c="dimmed">
        Deactivated users can no longer log in, but their visits stay in the community record.
      </Text>
    </Stack>
  );
}
