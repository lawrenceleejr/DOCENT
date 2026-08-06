// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import { Anchor, Card, Group, Progress, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconCircleCheck, IconCircleDashed } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface SetupStatus {
  site_name_set: boolean;
  access_code_set: boolean;
  institutions_imported: boolean;
  first_event_logged: boolean;
}

function StepRow({ done, label, hint, to }: { done: boolean; label: string; hint: string; to?: string }) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <ThemeIcon variant="light" color={done ? 'teal' : 'gray'} size="md" radius="xl">
        {done ? <IconCircleCheck size={18} /> : <IconCircleDashed size={18} />}
      </ThemeIcon>
      <div>
        <Text size="sm" fw={500} td={done ? 'line-through' : undefined} c={done ? 'dimmed' : undefined}>
          {to && !done ? (
            <Anchor component={Link} to={to} fw={500}>
              {label}
            </Anchor>
          ) : (
            label
          )}
        </Text>
        {!done && (
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        )}
      </div>
    </Group>
  );
}

/** First-run checklist for admins — appears until every step is done. */
export function GettingStartedCard() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['admin', 'setup'],
    queryFn: () => api.get<SetupStatus>('/api/admin/setup'),
    staleTime: 60_000,
  });

  if (!data) return null;
  const steps = [
    { done: data.site_name_set, label: t('gettingStarted.stepSiteName'), hint: t('gettingStarted.stepSiteNameHint') },
    { done: data.access_code_set, label: t('gettingStarted.stepAccessCode'), hint: t('gettingStarted.stepAccessCodeHint') },
    {
      done: data.institutions_imported,
      label: t('gettingStarted.stepInstitutions'),
      hint: t('gettingStarted.stepInstitutionsHint'),
    },
    {
      done: data.first_event_logged,
      label: t('gettingStarted.stepFirstEvent'),
      hint: t('gettingStarted.stepFirstEventHint'),
      to: '/visits/new',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card withBorder p="lg">
      <Group justify="space-between" mb="xs">
        <Title order={3}>{t('gettingStarted.title')}</Title>
        <Text size="sm" c="dimmed">
          {t('gettingStarted.progress', { done: doneCount, total: steps.length })}
        </Text>
      </Group>
      <Progress value={(doneCount / steps.length) * 100} size="sm" mb="md" />
      <Stack gap="sm">
        {steps.map((s) => (
          <StepRow key={s.label} done={s.done} label={s.label} hint={s.hint} to={s.to} />
        ))}
      </Stack>
    </Card>
  );
}
