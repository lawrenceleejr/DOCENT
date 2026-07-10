import {
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { INSTITUTION_TYPES, labelize } from '../api/types';

interface ImportResult {
  location: string;
  radius_km: number;
  region: string;
  inserted: number;
  updated: number;
  linked_venues: number;
  total_in_region: number;
}

const IMPORTABLE = INSTITUTION_TYPES.filter((t) => t !== 'other');

export function InstitutionImportCard() {
  const queryClient = useQueryClient();

  const form = useForm({
    initialValues: {
      location: '',
      radius: 25,
      unit: 'mi',
      types: ['school', 'college', 'museum', 'library'] as string[],
    },
    validate: {
      location: (v) => (v.trim().length > 0 ? null : 'Enter an address, place, or "lat, lon"'),
      radius: (v) => (v > 0 ? null : 'Radius must be positive'),
      types: (v) => (v.length > 0 ? null : 'Pick at least one type'),
    },
  });

  const runImport = useMutation({
    mutationFn: (values: typeof form.values) =>
      api.post<ImportResult>('/api/admin/institutions/import', {
        location: values.location.trim(),
        radius: values.radius,
        unit: values.unit,
        types: values.types,
        link_existing: true,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['map'] });
      queryClient.invalidateQueries({ queryKey: ['institutions'] });
      notifications.show({
        color: 'green',
        title: 'Import complete',
        message: `${r.inserted} added, ${r.updated} updated within ${r.radius_km} km of ${r.location}. ${r.total_in_region} total in this area.`,
        autoClose: 8000,
      });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Import failed',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
        autoClose: 8000,
      });
    },
  });

  return (
    <Card withBorder p="lg">
      <form onSubmit={form.onSubmit((values) => runImport.mutate(values))}>
        <Stack>
          <div>
            <Title order={4}>Import institutions near a location</Title>
            <Text c="dimmed" size="sm">
              Pull schools, colleges, museums and libraries from OpenStreetMap within a
              radius of a place, so they appear on the Map as coverage targets.
            </Text>
          </div>
          <TextInput
            label="Location"
            placeholder='Address, place name, or "lat, lon" — e.g. University of Tennessee, Knoxville'
            {...form.getInputProps('location')}
          />
          <Group align="flex-end">
            <NumberInput
              label="Radius"
              min={1}
              max={200}
              w={120}
              {...form.getInputProps('radius')}
            />
            <SegmentedControl
              data={[
                { label: 'miles', value: 'mi' },
                { label: 'km', value: 'km' },
              ]}
              {...form.getInputProps('unit')}
            />
            <Text size="xs" c="dimmed" pb={8}>
              Max 100 km / ~62 mi
            </Text>
          </Group>
          <Checkbox.Group label="Types" {...form.getInputProps('types')}>
            <Group gap="md" mt={4}>
              {IMPORTABLE.map((t) => (
                <Checkbox key={t} value={t} label={labelize(t)} />
              ))}
            </Group>
          </Checkbox.Group>
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              Large radii can take up to a minute (it queries OpenStreetMap live).
            </Text>
            <Button type="submit" loading={runImport.isPending}>
              Import
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}
