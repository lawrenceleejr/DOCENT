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
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={600}>
          {label}
        </Text>
        <CopyButton value={text} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
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
      notifications.show({ message: 'Site address saved', color: 'green' });
    },
    onError: (e) => {
      notifications.show({
        color: 'red',
        title: 'Could not save',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    },
  });

  const parsed = parseHost(urlValue);
  const host = parsed?.host ?? 'docent.your-org.edu';
  const ipValue = ip.trim() || '<your server’s public IP>';

  const dnsRequest = `Subject: DNS request — new A record for ${host}

Hi IT team,

We're running a small self-hosted web app on our own server and would like a
subdomain to point to it. Could you please create this DNS record?

    Type:   A
    Name:   ${host}
    Value:  ${ipValue}
    TTL:    3600   (1 hour)

If we also have an IPv6 address, please add a matching AAAA record to it.

Once the record is live we'll serve the site over HTTPS — the server obtains and
renews its own TLS certificate automatically, so nothing else is needed on your
end. The only inbound ports the server uses are 80 and 443.

Thanks very much!`;

  const envSnippet = `# in your .env on the server, then re-run ./scripts/start.sh
SITE_DOMAIN=${host}`;

  return (
    <Card withBorder p="lg">
      <UnstyledButton onClick={toggle} w="100%">
        <Group gap="xs" wrap="nowrap">
          {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          <IconWorld size={20} />
          <Title order={3}>Site address &amp; domain setup</Title>
          {!open && (
            <Text size="sm" c="dimmed">
              — point a subdomain at this server (optional)
            </Text>
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
      <Text size="sm" c="dimmed" mb="md" mt="md">
        Give your instance a friendly web address like{' '}
        <Code>https://docent.your-org.edu</Code>. This takes two things: a{' '}
        <strong>DNS “A record”</strong> your IT department adds (pointing the name at your
        machine), and HTTPS on the server — which DOCENT already bundles. Fill in the two
        fields below and this panel writes the exact request to send IT and the one-line
        change that turns HTTPS on.
      </Text>

      <Stack>
        <TextInput
          label="Public site address"
          description="Saved with your instance and used to build the setup instructions below."
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
            Save address
          </Button>
        </Group>

        {urlValue.trim() && !parsed && (
          <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
            That doesn’t look like a valid web address — use something like{' '}
            <Code>https://docent.your-org.edu</Code>.
          </Alert>
        )}

        <TextInput
          label="Your server’s public IP address"
          description="Find this in your cloud/VM console (e.g. the instance's public IPv4). Not stored — only used to fill in the request."
          placeholder="203.0.113.42"
          value={ip}
          onChange={(e) => setIp(e.currentTarget.value)}
        />

        <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
          <Text size="sm" fw={600} mb={4}>
            How the pieces fit together
          </Text>
          <Text size="sm">
            1. IT creates an <strong>A record</strong> so <Code>{host}</Code> resolves to your
            machine’s IP, and opens ports <strong>80</strong> and <strong>443</strong>. 2. You
            set <Code>SITE_DOMAIN</Code> in <Code>.env</Code> and re-run{' '}
            <Code>./scripts/start.sh</Code> — DOCENT’s bundled{' '}
            <a href="https://caddyserver.com" target="_blank" rel="noreferrer">
              Caddy
            </a>{' '}
            proxy then serves HTTPS and gets a free, auto-renewing certificate. Nothing extra
            to install. That’s the whole setup.
          </Text>
        </Alert>

        <CopyBlock label="1 · Request to send your IT / DNS department" text={dnsRequest} />
        <CopyBlock label="2 · Turn on HTTPS (on the server)" text={envSnippet} />
        <Text size="xs" c="dimmed">
          Once IT confirms the record is live, add that line to <Code>.env</Code> and run{' '}
          <Code>./scripts/start.sh</Code> — the bundled Caddy proxy starts automatically and
          fetches the certificate. DNS changes can take up to an hour to take effect
          worldwide. Leaving <Code>SITE_DOMAIN</Code> empty keeps the app on{' '}
          <Code>http://localhost</Code> only.
        </Text>
      </Stack>
      </Collapse>
    </Card>
  );
}
