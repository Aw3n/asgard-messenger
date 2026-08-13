import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { translations } from './translations'

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { code: 'hr', name: 'Hrvatski', flag: '🇭🇷' },
  { code: 'et', name: 'Eesti', flag: '🇪🇪' },
  { code: 'hu', name: 'Magyar', flag: '🇭🇺' },
  { code: 'lv', name: 'Latviešu', flag: '🇱🇻' },
  { code: 'lt', name: 'Lietuvių', flag: '🇱🇹' },
  { code: 'mt', name: 'Malti', flag: '🇲🇹' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'sk', name: 'Slovenčina', flag: '🇸🇰' },
  { code: 'sl', name: 'Slovenščina', flag: '🇸🇮' },
  { code: 'cs', name: 'Čeština', flag: '🇨🇿' },
  { code: 'bg', name: 'Български', flag: '🇧🇬' },
  { code: 'ga', name: 'Gaeilge', flag: '🇮🇪' },
  { code: 'ro', name: 'Română', flag: '🇷🇴' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
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

export function changeLanguage(lang: string): void {
  i18n.changeLanguage(lang)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('asgard-language', lang)
  }
}

export function getCurrentLanguage(): string {
  return i18n.language || 'fr'
}

export default i18n
