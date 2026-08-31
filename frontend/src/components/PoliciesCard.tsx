/**
 * Publish this instance's own policy documents — a privacy policy and terms of
 * use — as markdown, shown to users at /privacy and /terms.
 *
 * Each document starts empty and unpublished. The shipped example is loaded
 * into the editor on request rather than being the default, because an
 * unreviewed template served as a live policy would state retention periods
 * and rights the institution has never checked — worse than publishing nothing.
 *
 * "Upload" reads the file in the browser and drops its text into the editor, so
 * a markdown file kept under version control elsewhere can be pasted in and
 * still edited here before saving. Nothing is stored as a file server-side.
 */
import {
  Badge,
  Button,
  Card,
  Collapse,
  FileButton,
  Group,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
  IconFileText,
  IconUpload,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api, ApiError } from '../api/client';
import type { RegistrationSettings } from '../api/types';
import { POLICY_SLUGS, type PolicyExamples, type PolicySlug } from '../lib/policies';

const MAX_CHARS = 200_000;

export function PoliciesCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Collapsed by default: most instances set these once, if at all.
  const [open, { toggle }] = useDisclosure(false);

  const { data } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<RegistrationSettings>('/api/admin/settings'),
  });

  // Long documents, and most admins never load them — so only fetch once the
  // card is actually open.
  const { data: examples } = useQuery({
    queryKey: ['admin', 'policyExamples'],
    queryFn: () => api.get<PolicyExamples>('/api/admin/policies/examples'),
    enabled: open,
    staleTime: Infinity,
  });

  // null = untouched since load, so the saved value shows through.
  const [drafts, setDrafts] = useState<Record<PolicySlug, string | null>>({
    privacy: null,
    terms: null,
  });

  const stored = (slug: PolicySlug) =>
    (slug === 'privacy' ? data?.policy_privacy : data?.policy_terms) ?? '';
  const value = (slug: PolicySlug) => drafts[slug] ?? stored(slug);
  const set = (slug: PolicySlug, text: string) =>
    setDrafts((d) => ({ ...d, [slug]: text }));

  const dirty = POLICY_SLUGS.some((slug) => drafts[slug] !== null);
  const publishedCount = POLICY_SLUGS.filter((slug) => stored(slug).trim()).length;

  const save = useMutation({
    mutationFn: () =>
      api.patch<RegistrationSettings>('/api/admin/settings', {
        policy_privacy: value('privacy'),
        policy_terms: value('terms'),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings'], updated);
      // The footer links are driven by the public config, and the pages
      // themselves are cached per slug.
      queryClient.invalidateQueries({ queryKey: ['auth', 'config'] });
      queryClient.invalidateQueries({ queryKey: ['policy'] });
      setDrafts({ privacy: null, terms: null });
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

  async function loadFile(slug: PolicySlug, file: File | null) {
    if (!file) return;
    const text = await file.text();
    if (text.length > MAX_CHARS) {
      notifications.show({
        color: 'red',
        title: t('admin.couldNotSave'),
        message: t('admin.policyTooLong'),
      });
      return;
    }
    set(slug, text);
  }

  return (
    <Card withBorder p="lg">
      <UnstyledButton onClick={toggle} w="100%">
        <Group gap="xs" wrap="nowrap">
          {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          <IconFileText size={20} />
          <Title order={3}>{t('admin.policiesTitle')}</Title>
          <Badge color={publishedCount ? 'green' : 'gray'} variant="light">
            {publishedCount
              ? t('admin.policiesStatusPublished', { count: publishedCount })
              : t('admin.policiesStatusNone')}
          </Badge>
          {!open && (
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {t('admin.policiesCollapsedSubtitle')}
            </Text>
          )}
        </Group>
      </UnstyledButton>

      <Collapse in={open}>
        <Text size="sm" c="dimmed" mb="md" mt="md">
          {t('admin.policiesDescription')}
        </Text>

        <Stack gap="lg">
          {POLICY_SLUGS.map((slug) => {
            const published = stored(slug).trim().length > 0;
            return (
              <div key={slug}>
                <Group justify="space-between" mb={4} wrap="wrap">
                  <Group gap="xs">
                    <Text size="sm" fw={600}>
                      {t(`admin.policy_${slug}_label`)}
                    </Text>
                    {published && (
                      <Anchored slug={slug} label={t('admin.policiesViewLink')} />
                    )}
                  </Group>
                  <Group gap="xs">
                    <FileButton
                      onChange={(file) => loadFile(slug, file)}
                      accept=".md,.markdown,.txt,text/markdown,text/plain"
                    >
                      {(props) => (
                        <Button
                          {...props}
                          size="xs"
                          variant="light"
                          leftSection={<IconUpload size={14} />}
                        >
                          {t('admin.policiesUpload')}
                        </Button>
                      )}
                    </FileButton>
                    <Button
                      size="xs"
                      variant="subtle"
                      disabled={!examples}
                      onClick={() => examples && set(slug, examples[slug])}
                    >
                      {t('admin.policiesLoadExample')}
                    </Button>
                  </Group>
                </Group>
                <Textarea
                  description={t(`admin.policy_${slug}_description`)}
                  placeholder={t('admin.policiesPlaceholder')}
                  autosize
                  minRows={6}
                  maxRows={20}
                  styles={{
                    input: {
                      fontFamily: 'var(--mantine-font-family-monospace)',
                      fontSize: 12,
                    },
                  }}
                  value={value(slug)}
                  onChange={(e) => set(slug, e.currentTarget.value)}
                />
              </div>
            );
          })}
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

/** "View" link to the live page, so an admin can check what users will see. */
function Anchored({ slug, label }: { slug: PolicySlug; label: string }) {
  return (
    <Text size="xs" c="dimmed" component="span">
      <Link to={`/${slug}`} target="_blank" style={{ color: 'inherit' }}>
        {label} <IconExternalLink size={11} style={{ verticalAlign: -1 }} />
      </Link>
    </Text>
  );
}
