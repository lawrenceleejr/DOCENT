// DOCENT — Distributed Outreach & Community Engagement Network Tracker
// Copyright (C) 2026 Lawrence Lee
// Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import tl from './locales/tl.json';
import vi from './locales/vi.json';
import zhHans from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';

// The key used to persist the chosen language client-side (i18next-browser-
// languagedetector reads/writes this automatically once a language changes).
export const LANGUAGE_STORAGE_KEY = 'docent_lang';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'zh-Hant', label: '中文（繁體）' },
  { code: 'zh-Hans', label: '中文（简体）' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'tl', label: 'Tagalog' },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      'zh-Hant': { translation: zhHant },
      'zh-Hans': { translation: zhHans },
      vi: { translation: vi },
      tl: { translation: tl },
    },
    fallbackLng: 'en',
    // Strip region subtags (en-US -> en, es-MX -> es) so i18n.language always
    // matches one of our resource codes — otherwise it's the raw browser
    // locale, which breaks exact-match checks like "is this English?".
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      // Client-side "remembered" preference wins; otherwise fall back to the
      // browser's language, then to English.
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
  });

/** i18n.language can carry a region subtag (en-US, es-MX, …) straight from
 * the browser/localStorage even with load: 'languageOnly' — this strips it
 * down to the bare code our resources/SUPPORTED_LANGUAGES are keyed by. */
export function baseLanguage(code: string): string {
  return code.split('-')[0];
}

export default i18n;
