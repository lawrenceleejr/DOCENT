import {
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
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';
import { Logo } from '../components/Logo';

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    initialValues: { name: '', email: '', password: '', affiliation: '', invite_code: '' },
    validate: {
      name: (v) => (v.trim().length > 0 ? null : 'Name is required'),
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Invalid email'),
      password: (v) => (v.length >= 8 ? null : 'At least 8 characters'),
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
        invite_code: values.invite_code.trim() || undefined,
      });
      navigate('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <Stack gap="md">
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
            label="Invite code"
            placeholder="Leave blank unless your community requires one"
            {...form.getInputProps('invite_code')}
          />
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
