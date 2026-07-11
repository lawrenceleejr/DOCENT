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

function ContactLine({ email, prefix }: { email: string | null; prefix: string }) {
  if (email) {
    return (
      <Text size="sm" c="dimmed">
        {prefix} <Anchor href={`mailto:${email}`}>{email}</Anchor> to request one.
      </Text>
    );
  }
  return (
    <Text size="sm" c="dimmed">
      {prefix} your community administrator to request one.
    </Text>
  );
}

export function RegisterPage() {
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
      name: (v) => (v.trim().length > 0 ? null : 'Name is required'),
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Invalid email'),
      password: (v) => (v.length >= 8 ? null : 'At least 8 characters'),
      invite_code: (v) => (v.trim().length > 0 ? null : 'An access code is required'),
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
      setError(e instanceof ApiError ? e.message : 'Registration failed');
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
        Create your account
      </Title>
      <Text c="dimmed" size="sm">
        Join your community’s outreach record.
      </Text>
    </Stack>
  );

  // Sign-up is closed server-side (no access code configured).
  if (config && !registrationEnabled) {
    return (
      <AuthShell>
        <Stack gap="md">
          {header}
          <Alert color="brand" title="Registration is by invitation">
            <Stack gap={4}>
              <Text size="sm">New accounts require an access code from an administrator.</Text>
              <ContactLine email={contactEmail} prefix="Contact" />
            </Stack>
          </Alert>
          <Text size="sm" c="dimmed">
            Already have an account?{' '}
            <Anchor component={Link} to="/login">
              Log in
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
          <TextInput label="Full name" placeholder="Ada Lovelace" {...form.getInputProps('name')} />
          <TextInput label="Email" placeholder="you@university.edu" {...form.getInputProps('email')} />
          <PasswordInput
            label="Password"
            description="At least 8 characters"
            {...form.getInputProps('password')}
          />
          <TextInput
            label="Affiliation"
            placeholder="University of Tennessee (optional)"
            {...form.getInputProps('affiliation')}
          />
          <TextInput
            label="Access code"
            placeholder="Required"
            withAsterisk
            {...form.getInputProps('invite_code')}
          />
          <ContactLine email={contactEmail} prefix="Don’t have an access code? Contact" />
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          <Button type="submit" variant="gradient" loading={submitting}>
            Register
          </Button>
          <Text size="sm" c="dimmed">
            Already have an account?{' '}
            <Anchor component={Link} to="/login">
              Log in
            </Anchor>
          </Text>
        </Stack>
      </form>
    </AuthShell>
  );
}
