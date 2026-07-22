import { useTranslation } from 'react-i18next';

/** Translated labels for the shared enums (venue type, event type, audience
 * level, visit status, host relationship) — used in place of `labelize()`
 * on pages that have been localized. */
export function useEnumLabel() {
  const { t } = useTranslation();
  return {
    venueType: (v: string) => t(`enums.venueType.${v}`),
    eventType: (v: string) => t(`enums.eventType.${v}`),
    audienceLevel: (v: string) => t(`enums.audienceLevel.${v}`),
    visitStatus: (v: string) => t(`enums.visitStatus.${v}`),
    hostRelationship: (v: string) => t(`enums.hostRelationship.${v}`),
    coverageCategory: (v: string) => t(`enums.coverageCategory.${v}`),
    institutionType: (v: string) => t(`enums.institutionType.${v}`),
  };
}
