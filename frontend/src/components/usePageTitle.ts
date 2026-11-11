import { useEffect } from 'react';

/** Set the browser tab title for a page outside the main layout. */
export function usePageTitle(section: string | null | undefined) {
  useEffect(() => {
    document.title = section ? `${section} · DOCENT` : 'DOCENT';
  }, [section]);
}
