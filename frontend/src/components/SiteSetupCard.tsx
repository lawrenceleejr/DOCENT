import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Code,
  Collapse,
  CopyButton,
  Group,
  Stack,
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
  IconWorld,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { RegistrationSettings } from '../api/types';

/** Pull a bare hostname (and its first label) out of whatever the admin typed. */
function parseHost(value: string): { host: string; label: string } | null {
  const raw = value.trim();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  if (!host) return null;
  return { host, label: host.split('.')[0] };
}

/** A code block with a copy-to-clipboard button in the corner. */
function CopyBlock({ label, text }: { label: string; text: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={600}>
          {label}
        </Text>
        <CopyButton value={text} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? t('siteSetupCard.copiedTooltip') : t('siteSetupCard.copyTooltip')} withArrow>
              <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
      <Code block style={{ whiteSpace: 'pre-wrap' }}>
        {text}
      </Code>
    </div>
  );
}

export function SiteSetupCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Collapsed by default — most deployments won't touch domain setup.
  const [open, { toggle }] = useDisclosure(false);
  const { data } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<RegistrationSettings>('/api/admin/settings'),
  });

  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  // The server's public IP isn't stored — it's deployment info the admin reads
  // from their cloud/VM console. We only need it to fill in the request text.
  const [ip, setIp] = useState('');

  const urlValue = siteUrl ?? data?.site_url ?? '';

  const save = useMutation({
    mutationFn: () =>
      api.patch<RegistrationSettings>('/api/admin/settings', { site_url: urlValue }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings'], updated);
      setSiteUrl(null);
      notifications.show({ message: t('siteSetupCard.saveSuccessMessage'), color: 'green' });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: t('siteSetupCard.saveErrorTitle'),
        message: e instanceof ApiError ? e.message : t('siteSetupCard.unexpectedError'),
      });
    },
  });

  const parsed = parseHost(urlValue);
  const host = parsed?.host ?? 'docent.your-org.edu';
  const ipValue = ip.trim() || t('siteSetupCard.ipPlaceholderFallback');

  const dnsRequest = `${t('siteSetupCard.dnsRequestSubject', { host })}

${t('siteSetupCard.dnsRequestGreeting')}

${t('siteSetupCard.dnsRequestIntro')}

    Type:   A
    Name:   ${host}
    Value:  ${ipValue}
    TTL:    3600   (1 hour)

${t('siteSetupCard.dnsRequestIpv6Note')}

${t('siteSetupCard.dnsRequestClosing')}

${t('siteSetupCard.dnsRequestSignoff')}`;

  const envSnippet = `# ${t('siteSetupCard.envSnippetComment')}
SITE_DOMAIN=${host}`;

  return (
    <Card withBorder p="lg">
      <UnstyledButton onClick={toggle} w="100%">
        <Group gap="xs" wrap="nowrap">
          {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          <IconWorld size={20} />
          <Title order={3}>{t('siteSetupCard.title')}</Title>
          {!open && (
            <Text size="sm" c="dimmed">
              {t('siteSetupCard.collapsedSubtitle')}
            </Text>
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
      <Text size="sm" c="dimmed" mb="md" mt="md">
        <Trans
          i18nKey="siteSetupCard.description"
          components={{ code: <Code />, strong: <strong /> }}
        />
      </Text>

      <Stack>
        <TextInput
          label={t('siteSetupCard.publicSiteAddressLabel')}
          description={t('siteSetupCard.publicSiteAddressDescription')}
          placeholder="https://docent.your-org.edu"
          leftSection={<IconWorld size={16} />}
          value={urlValue}
          onChange={(e) => setSiteUrl(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            variant="light"
            loading={save.isPending}
            disabled={siteUrl === null}
            onClick={() => save.mutate()}
          >
            {t('siteSetupCard.saveButton')}
          </Button>
        </Group>

        {urlValue.trim() && !parsed && (
          <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
            <Trans
              i18nKey="siteSetupCard.invalidAddressWarning"
              components={{ code: <Code /> }}
            />
          </Alert>
        )}

        <TextInput
          label={t('siteSetupCard.serverIpLabel')}
          description={t('siteSetupCard.serverIpDescription')}
          placeholder="203.0.113.42"
          value={ip}
          onChange={(e) => setIp(e.currentTarget.value)}
        />

        <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
          <Text size="sm" fw={600} mb={4}>
            {t('siteSetupCard.howItFitsTogetherTitle')}
          </Text>
          <Text size="sm">
            <Trans
              i18nKey="siteSetupCard.howItFitsTogetherBody"
              values={{ host }}
              components={{
                strongRecord: <strong />,
                hostCode: <Code />,
                strongPort80: <strong />,
                strongPort443: <strong />,
                domainCode: <Code />,
                envCode: <Code />,
                scriptCode: <Code />,
                caddyLink: <a href="https://caddyserver.com" target="_blank" rel="noreferrer" />,
              }}
            />
          </Text>
        </Alert>

        <CopyBlock label={t('siteSetupCard.requestLabel')} text={dnsRequest} />
        <CopyBlock label={t('siteSetupCard.envSnippetLabel')} text={envSnippet} />
        <Text size="xs" c="dimmed">
          <Trans
            i18nKey="siteSetupCard.footerNote"
            components={{
              envCode: <Code />,
              scriptCode: <Code />,
              domainCode: <Code />,
              localhostCode: <Code />,
            }}
          />
        </Text>
      </Stack>
      </Collapse>
    </Card>
  );
}
