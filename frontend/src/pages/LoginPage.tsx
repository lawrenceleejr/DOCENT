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
  TypographyStylesProvider,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import remarkBreaks from 'remark-breaks';
import { api, ApiError } from '../api/client';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';
import { Logo } from '../components/Logo';

export function LoginPage() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/api/auth/config'),
  });

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+$/.test(v) ? null : t('login.invalidEmail')),
      password: (v) => (v.length > 0 ? null : t('login.passwordRequired')),
    },
  });

  if (user) return <Navigate to="/" replace />;

  const submit = form.onSubmit(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      navigate('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('login.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <Stack gap="lg">
          <Stack gap={4}>
            <Box hiddenFrom="sm">
              <Logo size={30} />
            </Box>
            <Title order={2} mt="xs">
              {t('login.welcomeBack')}
            </Title>
            <Text c="dimmed" size="sm">
              {config?.site_name
                ? t('login.loginToSite', { siteName: config.site_name })
                : t('login.loginToDefault')}
            </Text>
          </Stack>
          {config?.login_message && (
            <Alert color="brand" variant="light">
              <TypographyStylesProvider p={0} fz="sm">
                <ReactMarkdown
                  remarkPlugins={[remarkBreaks]}
                  components={{
                    a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
                  }}
                >
                  {config.login_message}
                </ReactMarkdown>
              </TypographyStylesProvider>
            </Alert>
          )}
          <TextInput
            label={t('login.emailLabel')}
            placeholder={t('login.emailPlaceholder')}
            type="email"
            autoComplete="username"
            size="md"
            {...form.getInputProps('email')}
          />
          <PasswordInput
            label={t('login.passwordLabel')}
            autoComplete="current-password"
            size="md"
            {...form.getInputProps('password')}
          />
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          <Button type="submit" size="md" variant="gradient" loading={submitting}>
            {t('login.submit')}
          </Button>
          <Text size="sm" c="dimmed">
            {t('login.forgotPassword')}{' '}
            {config?.contact_email ? (
              <>
                {t('login.contactPrefix')}{' '}
                <Anchor href={`mailto:${config.contact_email}`}>{config.contact_email}</Anchor>{' '}
                {t('login.contactForResetSuffix')}
              </>
            ) : (
              t('login.askAdminReset')
            )}
          </Text>
          <Text size="sm" c="dimmed">
            {t('login.noAccountYet')}{' '}
            <Anchor component={Link} to="/register">
              {t('login.registerLink')}
            </Anchor>
          </Text>
          {config?.public_page && (
            <Text size="sm" c="dimmed">
              <Anchor component={Link} to="/impact">
                {t('login.viewImpactLink')}
              </Anchor>{' '}
              {t('login.noAccountNeededSuffix')}
            </Text>
          )}
        </Stack>
      </form>
    </AuthShell>
  );
}
