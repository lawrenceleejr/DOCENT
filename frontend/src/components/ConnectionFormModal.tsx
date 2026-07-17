import { Button, Group, Modal, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { HOST_RELATIONSHIPS, labelize, type Connection } from '../api/types';
import { VenuePicker } from './VenuePicker';

interface ConnectionFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSaved: (connection: Connection) => void;
  /** Editing this connection instead of creating a new one. */
  connection?: Connection;
  /** Fixed venue context (e.g. opened from that venue's own page) — hides the
   * venue picker. When absent, the modal lets the user search-or-create the
   * venue as part of adding the connection. */
  venueId?: number;
  venueName?: string;
  /** Prefill from an existing visit host, to "start tracking" them. */
  initial?: {
    name?: string;
    role?: string | null;
    relationship_type?: string | null;
    relationship_detail?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

export function ConnectionFormModal({
  opened,
  onClose,
  onSaved,
  connection,
  venueId,
  venueName,
  initial,
}: ConnectionFormModalProps) {
  const editing = connection !== undefined;

  const form = useForm({
    initialValues: {
      venue_id: (venueId ?? null) as number | null,
      name: connection?.name ?? initial?.name ?? '',
      role: connection?.role ?? initial?.role ?? '',
      relationship_type: connection?.relationship_type ?? initial?.relationship_type ?? null,
      relationship_detail:
        connection?.relationship_detail ?? initial?.relationship_detail ?? '',
      email: connection?.email ?? initial?.email ?? '',
      phone: connection?.phone ?? initial?.phone ?? '',
      notes: connection?.notes ?? '',
    },
    validate: {
      name: (v) => (v.trim().length > 0 ? null : 'Name is required'),
      venue_id: (v) => (editing || v !== null ? null : 'Pick or create a venue'),
    },
  });

  const save = useMutation({
    mutationFn: (values: typeof form.values) => {
      const payload = {
        name: values.name.trim(),
        role: values.role.trim() || null,
        relationship_type: values.relationship_type || null,
        relationship_detail: values.relationship_detail.trim() || null,
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        notes: values.notes.trim() || null,
      };
      return editing
        ? api.patch<Connection>(`/api/connections/${connection.id}`, payload)
        : api.post<Connection>('/api/connections', { venue_id: values.venue_id, ...payload });
    },
    onSuccess: (saved) => {
      if (!editing) form.reset();
      onSaved(saved);
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: editing ? 'Could not save connection' : 'Could not add connection',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? 'Edit connection' : 'Add a connection'}
      size="lg"
    >
      <form onSubmit={form.onSubmit((values) => save.mutate(values))}>
        <Stack>
          {!editing &&
            (venueId ? (
              <Text size="sm" c="dimmed">
                At <b>{venueName}</b>
              </Text>
            ) : (
              <VenuePicker
                value={form.values.venue_id}
                onChange={(id) => form.setFieldValue('venue_id', id)}
                error={form.errors.venue_id as string | undefined}
              />
            ))}
          <TextInput
            label="Name"
            placeholder="Jane Doe"
            {...form.getInputProps('name')}
          />
          <Group grow>
            <TextInput
              label="Role / title"
              placeholder="5th grade teacher"
              {...form.getInputProps('role')}
            />
            <Select
              label="Relationship"
              placeholder="How do you know them?"
              clearable
              data={HOST_RELATIONSHIPS.map((r) => ({ value: r, label: labelize(r) }))}
              {...form.getInputProps('relationship_type')}
            />
          </Group>
          <TextInput
            label="Relationship detail"
            placeholder="Optional — e.g. coaches the robotics club"
            {...form.getInputProps('relationship_detail')}
          />
          <Group grow>
            <TextInput label="Email" {...form.getInputProps('email')} />
            <TextInput label="Phone" {...form.getInputProps('phone')} />
          </Group>
          <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Add connection'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
