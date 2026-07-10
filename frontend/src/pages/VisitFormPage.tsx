import {
  Button,
  Card,
  Checkbox,
  Collapse,
  Group,
  Input,
  NumberInput,
  Rating,
  Select,
  Stack,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  AUDIENCE_LEVELS,
  EVENT_TYPES,
  HOST_RELATIONSHIPS,
  labelize,
  MAX_PEOPLE_REACHED,
  PEOPLE_REACHED_CONFIRM_THRESHOLD,
  type Visit,
} from '../api/types';
import { VenuePicker } from '../components/VenuePicker';
import { toDateString } from './VisitListPage';

interface FormValues {
  venue_id: number | null;
  visit_date: Date | null;
  event_type: string;
  title: string;
  description: string;
  audience_level: string;
  people_reached: number | '';
  duration_minutes: number | '';
  contact_name: string;
  host_role: string;
  host_relationship: string;
  host_relationship_detail: string;
  contact_email: string;
  contact_phone: string;
  host_notes: string;
  rating: number;
  reflection: string;
  follow_up_planned: boolean;
  additional_presenters: string;
}

export function VisitFormPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [hostOpen, host] = useDisclosure(false);

  const { data: existing } = useQuery({
    queryKey: ['visits', id],
    queryFn: () => api.get<Visit>(`/api/visits/${id}`),
    enabled: editing,
  });

  const form = useForm<FormValues>({
    initialValues: {
      venue_id: null,
      visit_date: new Date(),
      event_type: 'classroom_visit',
      title: '',
      description: '',
      audience_level: '',
      people_reached: '',
      duration_minutes: '',
      contact_name: '',
      host_role: '',
      host_relationship: '',
      host_relationship_detail: '',
      contact_email: '',
      contact_phone: '',
      host_notes: '',
      rating: 0,
      reflection: '',
      follow_up_planned: false,
      additional_presenters: '',
    },
    validate: {
      venue_id: (v) => (v !== null ? null : 'Pick or create a venue'),
      visit_date: (v) => (v ? null : 'Date is required'),
      title: (v) => (v.trim().length > 0 ? null : 'Title is required'),
      event_type: (v) => (v ? null : 'Event type is required'),
      audience_level: (v) => (v ? null : 'Audience is required'),
      people_reached: (v) => {
        if (v === '' || v < 0) return 'How many people did you reach?';
        if (v > MAX_PEOPLE_REACHED)
          return `That seems too large (max ${MAX_PEOPLE_REACHED.toLocaleString()}). Check for a typo.`;
        return null;
      },
    },
  });

  useEffect(() => {
    if (existing) {
      form.setValues({
        venue_id: existing.venue.id,
        visit_date: new Date(`${existing.visit_date}T00:00:00`),
        event_type: existing.event_type,
        title: existing.title,
        description: existing.description ?? '',
        audience_level: existing.audience_level,
        people_reached: existing.people_reached,
        duration_minutes: existing.duration_minutes ?? '',
        contact_name: existing.contact_name ?? '',
        host_role: existing.host_role ?? '',
        host_relationship: existing.host_relationship ?? '',
        host_relationship_detail: existing.host_relationship_detail ?? '',
        contact_email: existing.contact_email ?? '',
        contact_phone: existing.contact_phone ?? '',
        host_notes: existing.host_notes ?? '',
        rating: existing.rating ?? 0,
        reflection: existing.reflection ?? '',
        follow_up_planned: existing.follow_up_planned,
        additional_presenters: existing.additional_presenters ?? '',
      });
      if (
        existing.contact_name ||
        existing.contact_email ||
        existing.contact_phone ||
        existing.host_role ||
        existing.host_relationship ||
        existing.host_notes
      ) {
        host.open();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  // Preselect a venue when arriving from the map's "Log a visit here".
  useEffect(() => {
    const venueParam = searchParams.get('venue');
    if (!editing && venueParam) {
      form.setFieldValue('venue_id', Number(venueParam));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, editing]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        venue_id: values.venue_id,
        visit_date: toDateString(values.visit_date!),
        event_type: values.event_type,
        title: values.title.trim(),
        description: values.description.trim() || null,
        audience_level: values.audience_level,
        people_reached: values.people_reached === '' ? 0 : values.people_reached,
        duration_minutes: values.duration_minutes === '' ? null : values.duration_minutes,
        contact_name: values.contact_name.trim() || null,
        host_role: values.host_role.trim() || null,
        host_relationship: values.host_relationship || null,
        host_relationship_detail: values.host_relationship_detail.trim() || null,
        contact_email: values.contact_email.trim() || null,
        contact_phone: values.contact_phone.trim() || null,
        host_notes: values.host_notes.trim() || null,
        rating: values.rating || null,
        reflection: values.reflection.trim() || null,
        follow_up_planned: values.follow_up_planned,
        additional_presenters: values.additional_presenters.trim() || null,
      };
      return editing
        ? api.patch<Visit>(`/api/visits/${id}`, payload)
        : api.post<Visit>('/api/visits', payload);
    },
    onSuccess: (visit) => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate(`/visits/${visit.id}`);
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: editing ? 'Could not save visit' : 'Could not log visit',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  return (
    <Stack maw={720} mx="auto">
      <Title order={2}>{editing ? 'Edit visit' : 'Log a visit'}</Title>
      <Card withBorder p="lg">
        <form
          onSubmit={form.onSubmit((values) => {
            const count = values.people_reached === '' ? 0 : values.people_reached;
            if (
              count > PEOPLE_REACHED_CONFIRM_THRESHOLD &&
              !window.confirm(
                `You entered ${count.toLocaleString()} people reached. Is that correct?`,
              )
            ) {
              return;
            }
            save.mutate(values);
          })}
        >
          <Stack>
            <VenuePicker
              value={form.values.venue_id}
              onChange={(venueId) => form.setFieldValue('venue_id', venueId)}
              error={form.errors.venue_id as string | undefined}
            />
            <Group grow>
              <DatePickerInput
                label="Date"
                valueFormat="YYYY-MM-DD"
                {...form.getInputProps('visit_date')}
              />
              <Select
                label="Event type"
                data={EVENT_TYPES.map((t) => ({ value: t, label: labelize(t) }))}
                {...form.getInputProps('event_type')}
              />
            </Group>
            <TextInput
              label="Title / topic"
              placeholder="e.g. Particle physics show-and-tell"
              {...form.getInputProps('title')}
            />
            <Textarea
              label="Description / notes"
              placeholder="What did you cover? Anything future visitors should know?"
              autosize
              minRows={2}
              {...form.getInputProps('description')}
            />
            <Group grow>
              <Select
                label="Audience level"
                placeholder="Pick one"
                data={AUDIENCE_LEVELS.map((t) => ({ value: t, label: labelize(t) }))}
                {...form.getInputProps('audience_level')}
              />
              <NumberInput
                label="People reached"
                min={0}
                placeholder="30"
                {...form.getInputProps('people_reached')}
              />
              <NumberInput
                label="Duration (minutes)"
                min={0}
                step={15}
                placeholder="60"
                {...form.getInputProps('duration_minutes')}
              />
            </Group>

            <UnstyledButton onClick={host.toggle} c="blue" fz="sm">
              {hostOpen ? '▾' : '▸'} Host (optional)
            </UnstyledButton>
            <Collapse in={hostOpen}>
              <Stack gap="sm">
                <Group grow>
                  <TextInput
                    label="Host name"
                    placeholder="Ms. Rivera"
                    {...form.getInputProps('contact_name')}
                  />
                  <TextInput
                    label="Role / title"
                    placeholder="8th-grade science teacher"
                    {...form.getInputProps('host_role')}
                  />
                </Group>
                <Group grow align="flex-start">
                  <Select
                    label="Relationship"
                    placeholder="How do you know them?"
                    clearable
                    data={HOST_RELATIONSHIPS.map((r) => ({ value: r, label: labelize(r) }))}
                    {...form.getInputProps('host_relationship')}
                  />
                  <TextInput
                    label="Relationship detail"
                    placeholder="e.g. former grad student, met at AAAS"
                    {...form.getInputProps('host_relationship_detail')}
                  />
                </Group>
                <Group grow>
                  <TextInput label="Email" {...form.getInputProps('contact_email')} />
                  <TextInput label="Phone" {...form.getInputProps('contact_phone')} />
                </Group>
                <Textarea
                  label="Host notes"
                  placeholder="Context on the host or the relationship — how the connection started, follow-up ideas…"
                  autosize
                  minRows={2}
                  {...form.getInputProps('host_notes')}
                />
              </Stack>
            </Collapse>

            <Input.Wrapper label="How did it go?">
              <Rating size="lg" {...form.getInputProps('rating')} />
            </Input.Wrapper>
            <Textarea
              label="Reflection"
              placeholder="What worked, what didn't, ideas for next time…"
              autosize
              minRows={2}
              {...form.getInputProps('reflection')}
            />
            <TextInput
              label="Additional presenters"
              placeholder="Co-presenter names, comma separated"
              description="If a colleague already logged this same event, don't re-enter the headcount here — it would double-count people reached in the community totals."
              {...form.getInputProps('additional_presenters')}
            />
            <Checkbox
              label="Follow-up planned with this venue"
              {...form.getInputProps('follow_up_planned', { type: 'checkbox' })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {editing ? 'Save changes' : 'Log visit'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
