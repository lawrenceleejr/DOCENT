/**
 * Basemap tile settings — the imagery behind the map markers, shared by the Map
 * page and the map embedded in PDF reports.
 *
 * Its own collapsed-by-default card (like the domain-setup and analytics cards)
 * because most instances never touch it: the shipped default is keyless and
 * works out of the box. The CARTO how-to inside is long, and permanently
 * expanded it buried the rest of the settings.
 */
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Collapse,
  CopyButton,
  Group,
  List,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconInfoCircle,
  IconMap,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { api, ApiError } from '../api/client';
import type { RegistrationSettings } from '../api/types';
import {
  CARTO_APIKEY_URL,
  CARTO_ATTRIBUTION,
  CARTO_DARK_URL,
  CARTO_LIGHT_URL,
  DEFAULT_LIGHT_URL,
} from '../lib/basemap';

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

export function BasemapCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Collapsed by default — the keyless default works with no configuration.
  const [open, { toggle }] = useDisclosure(false);

  const { data } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<RegistrationSettings>('/api/admin/settings'),
  });

  const [light, setLight] = useState<string | null>(null);
  const [dark, setDark] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [monochrome, setMonochrome] = useState<boolean | null>(null);

  const lightValue = light ?? data?.basemap_light_url ?? '';
  const darkValue = dark ?? data?.basemap_dark_url ?? '';
  const attributionValue = attribution ?? data?.basemap_attribution ?? '';
  const monochromeValue = monochrome ?? data?.basemap_monochrome ?? true;

  // What's actually in effect, so the collapsed header still says something.
  const usingDefault =
    !data || ((data.basemap_light_url || DEFAULT_LIGHT_URL) === DEFAULT_LIGHT_URL &&
      !data.basemap_dark_url);

  const dirty =
    light !== null || dark !== null || attribution !== null || monochrome !== null;

  const save = useMutation({
    mutationFn: () =>
      api.patch<RegistrationSettings>('/api/admin/settings', {
        basemap_light_url: lightValue,
        basemap_dark_url: darkValue,
        basemap_attribution: attributionValue,
        basemap_monochrome: monochromeValue,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings'], updated);
      // The map reads its tiles from the public config, so refresh that too.
      queryClient.invalidateQueries({ queryKey: ['auth', 'config'] });
      setLight(null);
      setDark(null);
      setAttribution(null);
      setMonochrome(null);
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

  return (
    <Card withBorder p="lg">
      <UnstyledButton onClick={toggle} w="100%">
        <Group gap="xs" wrap="nowrap">
          {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          <IconMap size={20} />
          <Title order={3}>{t('admin.basemapTitle')}</Title>
          <Badge color={usingDefault ? 'gray' : 'green'} variant="light">
            {usingDefault ? t('admin.basemapStatusDefault') : t('admin.basemapStatusCustom')}
          </Badge>
          {!open && (
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {t('admin.basemapCollapsedSubtitle')}
            </Text>
          )}
        </Group>
      </UnstyledButton>

      <Collapse in={open}>
        <Text size="sm" c="dimmed" mb="md" mt="md">
          {t('admin.basemapDescription')}
        </Text>

        <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />} mb="md">
          <Text size="sm" fw={600} mb={6}>
            {t('admin.basemapCartoTitle')}
          </Text>
          <List size="sm" spacing={4} type="ordered">
            <List.Item>
              <Trans
                i18nKey="admin.basemapCartoStep1"
                components={{
                  cartoLink: <Anchor href={CARTO_APIKEY_URL} target="_blank" rel="noreferrer" />,
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
            value={lightValue}
            onChange={(e) => setLight(e.currentTarget.value)}
          />
          <TextInput
            label={t('admin.basemapDarkLabel')}
            description={t('admin.basemapDarkDescription')}
            value={darkValue}
            onChange={(e) => setDark(e.currentTarget.value)}
          />
          <TextInput
            label={t('admin.basemapAttributionLabel')}
            description={t('admin.basemapAttributionDescription')}
            value={attributionValue}
            onChange={(e) => setAttribution(e.currentTarget.value)}
          />
          <Switch
            label={t('admin.basemapMonochromeLabel')}
            description={t('admin.basemapMonochromeDescription')}
            checked={monochromeValue}
            onChange={(e) => setMonochrome(e.currentTarget.checked)}
          />
        </Stack>

        <Group justify="flex-end" mt="md">
          <Button
            variant="gradient"
            loading={save.isPending}
            disabled={!dirty}
            onClick={() => save.mutate()}
          >
            {t('admin.save')}
          </Button>
        </Group>
      </Collapse>
    </Card>
  );
}
