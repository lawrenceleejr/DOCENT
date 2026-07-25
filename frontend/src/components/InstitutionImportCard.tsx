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
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { INSTITUTION_TYPES } from '../api/types';
import { useEnumLabel } from '../i18n/enumLabels';

interface ImportResult {
  location: string;
  radius_km: number;
  region: string;
  inserted: number;
  updated: number;
  linked_venues: number;
  total_in_region: number;
}

const IMPORTABLE = INSTITUTION_TYPES.filter((v) => v !== 'other');

export function InstitutionImportCard() {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();
  const queryClient = useQueryClient();

  const form = useForm({
    initialValues: {
      location: '',
      radius: 25,
      unit: 'mi',
      types: ['school', 'college', 'museum', 'library'] as string[],
    },
    validate: {
      location: (v) => (v.trim().length > 0 ? null : t('institutionImportCard.locationRequired')),
      radius: (v) => (v > 0 ? null : t('institutionImportCard.radiusPositive')),
      types: (v) => (v.length > 0 ? null : t('institutionImportCard.typesRequired')),
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
        title: t('institutionImportCard.importCompleteTitle'),
        message: t('institutionImportCard.importCompleteMessage', {
          inserted: r.inserted,
          updated: r.updated,
          radiusKm: r.radius_km,
          location: r.location,
          totalInRegion: r.total_in_region,
        }),
        autoClose: 8000,
      });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('institutionImportCard.importFailedTitle'),
        message: e instanceof ApiError ? e.message : t('institutionImportCard.unexpectedError'),
        autoClose: 8000,
      });
    },
  });

  return (
    <Card withBorder p="lg">
      <form onSubmit={form.onSubmit((values) => runImport.mutate(values))}>
        <Stack>
          <div>
            <Title order={4}>{t('institutionImportCard.title')}</Title>
            <Text c="dimmed" size="sm">
              {t('institutionImportCard.description')}
            </Text>
          </div>
          <TextInput
            label={t('institutionImportCard.locationLabel')}
            placeholder={t('institutionImportCard.locationPlaceholder')}
            {...form.getInputProps('location')}
          />
          <Group align="flex-end">
            <NumberInput
              label={t('institutionImportCard.radiusLabel')}
              min={1}
              max={200}
              w={120}
              {...form.getInputProps('radius')}
            />
            <SegmentedControl
              data={[
                { label: t('institutionImportCard.unitMiles'), value: 'mi' },
                { label: t('institutionImportCard.unitKm'), value: 'km' },
              ]}
              {...form.getInputProps('unit')}
            />
            <Text size="xs" c="dimmed" pb={8}>
              {t('institutionImportCard.maxRadiusHint')}
            </Text>
          </Group>
          <Checkbox.Group label={t('institutionImportCard.typesLabel')} {...form.getInputProps('types')}>
            <Group gap="md" mt={4}>
              {IMPORTABLE.map((v) => (
                <Checkbox key={v} value={v} label={enumLabel.institutionType(v)} />
              ))}
            </Group>
          </Checkbox.Group>
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              {t('institutionImportCard.largeRadiusHint')}
            </Text>
            <Button type="submit" loading={runImport.isPending}>
              {t('institutionImportCard.importButton')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}
