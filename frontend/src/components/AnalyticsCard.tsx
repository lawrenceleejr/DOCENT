// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Collapse,
  Group,
  List,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconChartBar,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconInfoCircle,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { RegistrationSettings } from '../api/types';
import { extractCfToken } from './analytics';

const DASH_URL = 'https://dash.cloudflare.com/?to=/:account/web-analytics';

export function AnalyticsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Collapsed by default — analytics is optional, like the domain-setup card.
  const [open, { toggle }] = useDisclosure(false);
  const { data } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<RegistrationSettings>('/api/admin/settings'),
  });

  const [snippet, setSnippet] = useState<string | null>(null);
  const snippetValue = snippet ?? data?.cf_analytics_snippet ?? '';
  const token = extractCfToken(snippetValue);
  const configured = snippetValue.trim().length > 0;

  const save = useMutation({
    mutationFn: () =>
      api.patch<RegistrationSettings>('/api/admin/settings', {
        cf_analytics_snippet: snippetValue,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings'], updated);
      // Refresh the public config so the beacon (un)loads without a reload.
      queryClient.invalidateQueries({ queryKey: ['auth', 'config'] });
      setSnippet(null);
      notifications.show({ message: t('analyticsCard.saveSuccessMessage'), color: 'green' });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('analyticsCard.saveErrorTitle'),
        message: e instanceof ApiError ? e.message : t('analyticsCard.unexpectedError'),
      });
    },
  });

  return (
    <Card withBorder p="lg">
      <UnstyledButton onClick={toggle} w="100%">
        <Group gap="xs" wrap="nowrap">
          {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          <IconChartBar size={20} />
          <Title order={3}>{t('analyticsCard.title')}</Title>
          <Badge color={token ? 'green' : 'gray'} variant="light">
            {token ? t('analyticsCard.statusActive') : t('analyticsCard.statusOff')}
          </Badge>
          {!open && (
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {t('analyticsCard.collapsedSubtitle')}
            </Text>
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <Text size="sm" c="dimmed" mb="md" mt="md">
          <Trans
            i18nKey="analyticsCard.description"
            components={{
              cfLink: (
                <Anchor
                  href="https://www.cloudflare.com/web-analytics/"
                  target="_blank"
                  rel="noreferrer"
                />
              ),
            }}
          />
        </Text>

        <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />} mb="md">
          <Text size="sm" fw={600} mb={6}>
            {t('analyticsCard.howToTitle')}
          </Text>
          <List size="sm" spacing={4} type="ordered">
            <List.Item>
              <Trans
                i18nKey="analyticsCard.step1"
                components={{
                  dashLink: <Anchor href={DASH_URL} target="_blank" rel="noreferrer" />,
                }}
              />
            </List.Item>
            <List.Item>{t('analyticsCard.step2')}</List.Item>
            <List.Item>{t('analyticsCard.step3')}</List.Item>
            <List.Item>{t('analyticsCard.step4')}</List.Item>
          </List>
        </Alert>

        <Stack>
          <Textarea
            label={t('analyticsCard.snippetLabel')}
            description={t('analyticsCard.snippetDescription')}
            placeholder={
              '<!-- Cloudflare Web Analytics -->\n<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "…"}\'></script>'
            }
            autosize
            minRows={3}
            maxRows={8}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 } }}
            value={snippetValue}
            onChange={(e) => setSnippet(e.currentTarget.value)}
          />

          {configured && token && (
            <Alert color="green" variant="light" icon={<IconCircleCheck size={16} />}>
              {t('analyticsCard.tokenDetected')}
            </Alert>
          )}
          {configured && !token && (
            <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
              {t('analyticsCard.tokenNotFound')}
            </Alert>
          )}

          <Text size="xs" c="dimmed">
            <Trans i18nKey="analyticsCard.privacyNote" components={{ code: <Code /> }} />
          </Text>

          <Group justify="flex-end">
            <Button
              variant="light"
              loading={save.isPending}
              disabled={snippet === null}
              onClick={() => save.mutate()}
            >
              {t('analyticsCard.saveButton')}
            </Button>
          </Group>
        </Stack>
      </Collapse>
    </Card>
  );
}
