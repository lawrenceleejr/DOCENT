import {
  Alert,
  Anchor,
  Box,
  Button,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';
import { Logo } from '../components/Logo';

function ContactLine({ email, prefix }: { email: string | null; prefix: string }) {
  const { t } = useTranslation();
  if (email) {
    return (
      <Text size="sm" c="dimmed">
        {prefix} <Anchor href={`mailto:${email}`}>{email}</Anchor> {t('register.contactSuffixRequest')}
      </Text>
    );
  }
  return (
    <Text size="sm" c="dimmed">
      {prefix} {t('register.contactAdminFallback')}
    </Text>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/api/auth/config'),
  });
  const contactEmail = config?.contact_email ?? null;
  const registrationEnabled = config?.registration_enabled ?? true;

  const form = useForm({
    initialValues: { name: '', email: '', password: '', affiliation: '', invite_code: '' },
    validate: {
      name: (v) => (v.trim().length > 0 ? null : t('register.validation.nameRequired')),
      email: (v) => (/^\S+@\S+$/.test(v) ? null : t('register.validation.invalidEmail')),
      password: (v) => (v.length >= 8 ? null : t('register.validation.passwordMin')),
      invite_code: (v) => (v.trim().length > 0 ? null : t('register.validation.codeRequired')),
    },
  });

  if (user) return <Navigate to="/" replace />;

  const submit = form.onSubmit(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      await register({
        name: values.name.trim(),
        email: values.email,
        password: values.password,
        affiliation: values.affiliation.trim() || undefined,
        invite_code: values.invite_code.trim(),
      });
      navigate('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('register.registrationFailed'));
    } finally {
      setSubmitting(false);
    }
  });

  const header = (
    <Stack gap={4}>
      <Box hiddenFrom="sm">
        <Logo size={30} />
      </Box>
      <Title order={2} mt="xs">
        {t('register.createAccount')}
      </Title>
      <Text c="dimmed" size="sm">
        {t('register.joinCommunity')}
      </Text>
    </Stack>
  );

  // Sign-up is closed server-side (no access code configured).
  if (config && !registrationEnabled) {
    return (
      <AuthShell>
        <Stack gap="md">
          {header}
          <Alert color="brand" title={t('register.closedTitle')}>
            <Stack gap={4}>
              <Text size="sm">{t('register.closedBody')}</Text>
              <ContactLine email={contactEmail} prefix={t('register.closedContactPrefix')} />
            </Stack>
          </Alert>
          <Text size="sm" c="dimmed">
            {t('register.alreadyHaveAccount')}{' '}
            <Anchor component={Link} to="/login">
              {t('register.loginLink')}
            </Anchor>
          </Text>
        </Stack>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <Stack gap="md">
          {header}
          <TextInput
            label={t('register.fullNameLabel')}
            placeholder={t('register.fullNamePlaceholder')}
            autoComplete="name"
            {...form.getInputProps('name')}
          />
          <TextInput
            label={t('register.emailLabel')}
            placeholder={t('register.emailPlaceholder')}
            type="email"
            autoComplete="username"
            {...form.getInputProps('email')}
          />
          <PasswordInput
            label={t('register.passwordLabel')}
            description={t('register.passwordDescription')}
            autoComplete="new-password"
            {...form.getInputProps('password')}
          />
          <TextInput
            label={t('register.affiliationLabel')}
            placeholder={t('register.affiliationPlaceholder')}
            {...form.getInputProps('affiliation')}
          />
          <TextInput
            label={t('register.accessCodeLabel')}
            placeholder={t('register.accessCodeRequired')}
            withAsterisk
            {...form.getInputProps('invite_code')}
          />
          <ContactLine email={contactEmail} prefix={t('register.contactPrefixHaveCode')} />
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          <Button type="submit" variant="gradient" loading={submitting}>
            {t('register.submit')}
          </Button>
          <Text size="sm" c="dimmed">
            {t('register.alreadyHaveAccount')}{' '}
            <Anchor component={Link} to="/login">
              {t('register.loginLink')}
            </Anchor>
          </Text>
        </Stack>
      </form>
    </AuthShell>
  );
}
