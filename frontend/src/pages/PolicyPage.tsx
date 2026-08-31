/**
 * A policy document an admin has published for this instance (privacy policy,
 * terms of use), rendered from markdown.
 *
 * Deliberately outside the auth guard: a privacy policy has to be readable
 * *before* someone hands over an email address to register, and the footer
 * links to it from the signed-out pages too.
 *
 * Markdown is rendered with raw HTML disabled (react-markdown's default), so
 * admin-authored text can't inject script. Don't add rehype-raw here.
 */
import { Alert, Anchor, Container, Loader, Stack, Text, TypographyStylesProvider } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api, ApiError } from '../api/client';
import type { PolicyDoc } from '../api/types';

export function PolicyPage() {
  const { t } = useTranslation();
  // Routed at the literal paths /privacy and /terms — friendlier to link to
  // from inside a policy than /policy/privacy — so the slug comes from the
  // pathname rather than a route param.
  const slug = useLocation().pathname.replace(/^\/+/, '');

  const { data, isLoading, error } = useQuery({
    queryKey: ['policy', slug],
    queryFn: () => api.get<PolicyDoc>(`/api/public/policy/${slug}`),
    retry: false,
  });

  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <Container size="sm" py="xl">
      <Stack>
        {isLoading && <Loader />}
        {notFound && (
          <Alert color="gray" variant="light" title={t('policy.notPublishedTitle')}>
            {t('policy.notPublishedBody')}
          </Alert>
        )}
        {!isLoading && !notFound && error && (
          <Alert color="red" variant="light">
            {error instanceof ApiError ? error.message : t('common.unexpectedError')}
          </Alert>
        )}
        {data && (
          <TypographyStylesProvider p={0}>
            <ReactMarkdown
              components={{
                a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
              }}
            >
              {data.body}
            </ReactMarkdown>
          </TypographyStylesProvider>
        )}
        <Text size="sm">
          <Anchor component={Link} to="/">
            {t('policy.backHome')}
          </Anchor>
        </Text>
      </Stack>
    </Container>
  );
}
