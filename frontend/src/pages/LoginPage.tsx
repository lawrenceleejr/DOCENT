import {
  Anchor,
  Button,
  Card,
  Center,
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

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <Center h="100vh" p="md">
      <Card withBorder shadow="sm" w={380} p="xl">
        <form onSubmit={submit}>
          <Stack>
            <div>
              <Title order={2}>DOCENT</Title>
              <Text c="dimmed" size="sm">
                Reach out.
              </Text>
            </div>
            <TextInput label="Email" placeholder="you@university.edu" {...form.getInputProps('email')} />
            <PasswordInput label="Password" {...form.getInputProps('password')} />
            {error && (
              <Text c="red" size="sm">
                {error}
              </Text>
            )}
            <Button type="submit" loading={submitting}>
              Log in
            </Button>
            <Text size="sm" c="dimmed">
              No account yet?{' '}
              <Anchor component={Link} to="/register">
                Register
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Card>
    </Center>
  );
}
