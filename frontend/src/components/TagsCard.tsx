// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowsJoin, IconPencil, IconTags } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

interface TagCount {
  tag: string;
  count: number;
}

/** Admin tag hygiene: rename a tag everywhere; renaming onto an existing tag
 * merges the two (free-text tags drift — "nsf-career" vs "NSF Career"). */
export function TagsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tags = [] } = useQuery({
    queryKey: ['admin', 'tags'],
    queryFn: () => api.get<TagCount[]>('/api/admin/tags'),
  });

  const [opened, { open, close }] = useDisclosure(false);
  const [fromTag, setFromTag] = useState('');
  const [toTag, setToTag] = useState('');

  const rename = useMutation({
    mutationFn: () =>
      api.post<{ events_updated: number }>('/api/admin/tags/rename', {
        from_tag: fromTag,
        to_tag: toTag,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tags'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      notifications.show({
        message: t('tagsCard.renameSuccess', { count: r.events_updated }),
      });
      close();
    },
    onError: (e) =>
      notifications.show({
        color: 'red',
        message: e instanceof ApiError ? e.message : t('common.unexpectedError'),
      }),
  });

  const normalizedTo = toTag.trim().toLowerCase();
  const isMerge =
    normalizedTo.length > 0 &&
    normalizedTo !== fromTag &&
    tags.some((x) => x.tag === normalizedTo);

  if (tags.length === 0) return null;

  return (
    <Card withBorder p="lg">
      <Group gap="xs" mb="xs">
        <IconTags size={20} />
        <Title order={3}>{t('tagsCard.title')}</Title>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        {t('tagsCard.description')}
      </Text>
      <Table.ScrollContainer minWidth={320}>
        <Table highlightOnHover>
          <Table.Tbody>
            {tags.map((row) => (
              <Table.Tr key={row.tag}>
                <Table.Td>
                  <Badge variant="light" color="grape">
                    {row.tag}
                  </Badge>
                </Table.Td>
                <Table.Td ta="right" className="tabular-nums">
                  {t('tagsCard.eventCount', { count: row.count, formattedCount: row.count.toLocaleString() })}
                </Table.Td>
                <Table.Td ta="right">
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    leftSection={<IconPencil size={14} />}
                    onClick={() => {
                      setFromTag(row.tag);
                      setToTag('');
                      open();
                    }}
                  >
                    {t('tagsCard.renameButton')}
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={close} title={t('tagsCard.renameModalTitle', { tag: fromTag })} centered>
        <Stack gap="sm">
          <TextInput
            label={t('tagsCard.newTagLabel')}
            placeholder={fromTag}
            value={toTag}
            onChange={(e) => setToTag(e.currentTarget.value)}
            data-autofocus
          />
          {isMerge && (
            <Alert color="grape" icon={<IconArrowsJoin size={16} />}>
              {t('tagsCard.mergeNotice', { from: fromTag, to: normalizedTo })}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={rename.isPending}
              disabled={normalizedTo.length === 0 || normalizedTo === fromTag}
              onClick={() => rename.mutate()}
            >
              {isMerge ? t('tagsCard.mergeButton') : t('tagsCard.renameConfirmButton')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
