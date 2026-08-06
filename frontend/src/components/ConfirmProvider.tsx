// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface ConfirmOptions {
  title: string;
  /** What will happen, in plain language. Spell out anything irreversible. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button — use for anything that destroys data. */
  danger?: boolean;
  /** Extra warning callout, e.g. "this also deletes 12 events". */
  warning?: ReactNode;
  /** Require typing this word first. Reserve for wide-blast-radius actions. */
  typeToConfirm?: string;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Styled replacement for window.confirm. Native dialogs are unstyled, can't
 * show consequences or a red destructive action, and "OK" is muscle memory —
 * a poor guard for deleting a venue and every event attached to it.
 *
 * Awaitable, so call sites read like the native call they replace:
 *   if (await confirm({ ... })) remove.mutate();
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<{ fn: Resolver } | null>(null);
  const [typed, setTyped] = useState('');

  const confirm = useCallback((next: ConfirmOptions) => {
    setOpts(next);
    setTyped('');
    return new Promise<boolean>((resolve) => setResolver({ fn: resolve }));
  }, []);

  const settle = (ok: boolean) => {
    resolver?.fn(ok);
    setResolver(null);
    setOpts(null);
    setTyped('');
  };

  const needsTyping = !!opts?.typeToConfirm;
  const typedOk = !needsTyping || typed.trim().toUpperCase() === opts!.typeToConfirm!.toUpperCase();

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        opened={!!opts}
        onClose={() => settle(false)}
        title={opts?.title}
        centered
        // Escape/outside-click cancel, matching the native dialog's safe default.
        closeOnClickOutside
        closeOnEscape
      >
        {opts && (
          <Stack gap="sm">
            <Text size="sm">{opts.message}</Text>
            {opts.warning && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
                {opts.warning}
              </Alert>
            )}
            {needsTyping && (
              <TextInput
                label={t('confirm.typeToConfirm', { word: opts.typeToConfirm })}
                placeholder={opts.typeToConfirm}
                value={typed}
                onChange={(e) => setTyped(e.currentTarget.value)}
                data-autofocus
              />
            )}
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={() => settle(false)}>
                {opts.cancelLabel ?? t('common.cancel')}
              </Button>
              <Button
                color={opts.danger ? 'red' : undefined}
                disabled={!typedOk}
                onClick={() => settle(true)}
              >
                {opts.confirmLabel ?? t('common.confirm')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

/** Stable no-op-safe helper for components that only need a yes/no prompt. */
export function useConfirmDialog() {
  const confirm = useConfirm();
  return useMemo(() => confirm, [confirm]);
}
