import { Notifications } from '@mantine/notifications';
import { useMediaQuery } from '@mantine/hooks';

/**
 * Toasts sit top-right on desktop, but on a phone that corner is cramped under
 * the account menu and the fixed header. Drop them to bottom-center on mobile so
 * they read like a native snackbar. Uses the same breakpoint as the rest of the
 * app (FilterCard). Must render inside MantineProvider.
 */
export function AppNotifications() {
  const isMobile = useMediaQuery('(max-width: 47.99em)') ?? false;
  return <Notifications position={isMobile ? 'bottom-center' : 'top-right'} />;
}
