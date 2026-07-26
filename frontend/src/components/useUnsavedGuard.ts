import { useEffect } from 'react';

/**
 * Warn before losing unsaved form data (issue #11).
 *
 * While `dirty` is true this installs a `beforeunload` handler, so closing the
 * tab, reloading, or navigating to an external URL raises the browser's native
 * "Leave site?" prompt. In-app navigation (Cancel, header links) is guarded at
 * the call site with `confirmLeave()` — the app mounts a plain BrowserRouter,
 * so react-router's data-router-only `useBlocker` isn't available here.
 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers need returnValue set to trigger the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

/**
 * Returns true if it's safe to navigate away: either nothing is dirty, or the
 * user confirms discarding their changes. Use to gate in-app exits.
 */
export function confirmLeave(dirty: boolean, message: string): boolean {
  return !dirty || window.confirm(message);
}
