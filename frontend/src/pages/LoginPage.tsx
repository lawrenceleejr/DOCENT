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
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';
import { Logo } from '../components/Logo';

export function LoginPage() {
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
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Invalid email'),
      password: (v) => (v.length > 0 ? null : 'Password is required'),
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
      setError(e instanceof ApiError ? e.message : 'Login failed');
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
              Welcome back
            </Title>
            <Text c="dimmed" size="sm">
              {config?.site_name
                ? `Log in to ${config.site_name}.`
                : 'Log in to your DOCENT account.'}
            </Text>
          </Stack>
          {config?.login_message && (
            <Alert color="brand" variant="light">
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {config.login_message}
              </Text>
            </Alert>
          )}
          <TextInput
            label="Email"
            placeholder="you@university.edu"
            type="email"
            autoComplete="username"
            size="md"
            {...form.getInputProps('email')}
          />
          <PasswordInput
            label="Password"
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
            Log in
          </Button>
          <Text size="sm" c="dimmed">
            Forgot your password?{' '}
            {config?.contact_email ? (
              <>
                Contact <Anchor href={`mailto:${config.contact_email}`}>{config.contact_email}</Anchor>{' '}
                for a reset.
              </>
            ) : (
              'Ask your community administrator to reset it.'
            )}
          </Text>
          <Text size="sm" c="dimmed">
            No account yet?{' '}
            <Anchor component={Link} to="/register">
              Register
            </Anchor>
          </Text>
          {config?.public_page && (
            <Text size="sm" c="dimmed">
              <Anchor component={Link} to="/impact">
                View our public impact page
              </Anchor>{' '}
              — no account needed.
            </Text>
          )}
        </Stack>
      </form>
    </AuthShell>
  );
}
