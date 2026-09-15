import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { translations } from './translations'

/**
 * Langues prises en charge. Pas de drapeau émoji : un drapeau n'est pas un
 * caractère mais une suite de deux indicateurs régionaux (U+1F1E6…U+1F1FF)
 * qu'une police doit savoir composer. Linux n'impose aucune police émoji, et
 * Noto Color Emoji elle-même ne contient aucun drapeau — le rendu y est donc
 * soit un rectangle vide, soit les deux lettres brutes. La liste affiche
 * désormais le code en lettrines, avec le même chemin de code que le nom de la
 * langue : identique sur les trois systèmes.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'fr', name: 'Français' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'da', name: 'Dansk' },
  { code: 'fi', name: 'Suomi' },
  { code: 'sv', name: 'Svenska' },
  { code: 'hr', name: 'Hrvatski' },
  { code: 'et', name: 'Eesti' },
  { code: 'hu', name: 'Magyar' },
  { code: 'lv', name: 'Latviešu' },
  { code: 'lt', name: 'Lietuvių' },
  { code: 'mt', name: 'Malti' },
  { code: 'pl', name: 'Polski' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'sl', name: 'Slovenščina' },
  { code: 'cs', name: 'Čeština' },
  { code: 'bg', name: 'Български' },
  { code: 'ga', name: 'Gaeilge' },
  { code: 'ro', name: 'Română' },
  { code: 'uk', name: 'Українська' },
  { code: 'en', name: 'English' },
] as const

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code']

const savedLang = typeof localStorage !== 'undefined'
  ? localStorage.getItem('asgard-language') || 'fr'
  : 'fr'

i18n
  .use(initReactI18next)
  .init({
    resources: translations,
    lng: savedLang,
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false,
    },
    defaultNS: 'translation',
  })

// Keep the main process in sync so the native tray menu uses the same
// language (see electron/tray.ts — the main process has no i18next).
try { window.asgard?.setLanguage?.(savedLang) } catch { /* preload not ready */ }

export function changeLanguage(lang: string): void {
  i18n.changeLanguage(lang)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('asgard-language', lang)
  }
  window.asgard?.setLanguage?.(lang)
}

export function getCurrentLanguage(): string {
  return i18n.language || 'fr'
}

export default i18n
