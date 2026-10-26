import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from './locales/fr'

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

interface LocaleResource {
  translation: Record<string, string>
}

// Le français est le fallback : il reste dans le chunk principal. Les autres
// catalogues sont des chunks séparés, chargés seulement si la langue est
// choisie — les embarquer tous pesait 58 % du bundle de démarrage.
const LOCALE_LOADERS: Record<string, () => Promise<{ default: LocaleResource }>> = {
  nl: () => import('./locales/nl'),
  de: () => import('./locales/de'),
  it: () => import('./locales/it'),
  es: () => import('./locales/es'),
  pt: () => import('./locales/pt'),
  el: () => import('./locales/el'),
  da: () => import('./locales/da'),
  fi: () => import('./locales/fi'),
  sv: () => import('./locales/sv'),
  hr: () => import('./locales/hr'),
  et: () => import('./locales/et'),
  hu: () => import('./locales/hu'),
  lv: () => import('./locales/lv'),
  lt: () => import('./locales/lt'),
  mt: () => import('./locales/mt'),
  pl: () => import('./locales/pl'),
  sk: () => import('./locales/sk'),
  sl: () => import('./locales/sl'),
  cs: () => import('./locales/cs'),
  bg: () => import('./locales/bg'),
  ga: () => import('./locales/ga'),
  ro: () => import('./locales/ro'),
  en: () => import('./locales/en'),
  uk: () => import('./locales/uk'),
}

const storedLang = typeof localStorage !== 'undefined'
  ? localStorage.getItem('asgard-language')
  : null
const savedLang = SUPPORTED_LANGUAGES.some(({ code }) => code === storedLang)
  ? storedLang as LanguageCode
  : 'fr'

/**
 * La langue annoncée par <html lang>. `index.html` la fige à « en » : un
 * lecteur d'écran prononçait alors le français, l'allemand ou l'ukrainien avec
 * la voix anglaise, et la règle de césure suivait la même erreur. Le code de
 * langue est aussi ce que lit la synthèse vocale pour choisir sa voix.
 */
function syncDocumentLanguage(lang: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

syncDocumentLanguage(savedLang)

i18n
  .use(initReactI18next)
  .init({
    resources: { fr },
    lng: 'fr',
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false,
    },
    defaultNS: 'translation',
  })

// Tout changement de langue passe par i18n.changeLanguage (démarrage et écran
// des réglages) : l'écouteur garde <html lang> d'accord sans second point
// d'appel à maintenir.
i18n.on('languageChanged', syncDocumentLanguage)

async function loadLocale(lang: string): Promise<boolean> {
  if (i18n.hasResourceBundle(lang, 'translation')) return true
  const load = LOCALE_LOADERS[lang]
  if (!load) return false
  const { default: resource } = await load()
  i18n.addResourceBundle(lang, 'translation', resource.translation, true, true)
  return true
}

/**
 * Résolution de la langue enregistrée avant le premier rendu. Sans cette
 * attente, une session en allemand afficherait les clés brutes le temps que
 * le chunk de la langue arrive.
 */
export const i18nReady: Promise<void> = (async () => {
  if (savedLang === 'fr') return
  try {
    if (await loadLocale(savedLang)) await i18n.changeLanguage(savedLang)
  } catch (err) {
    console.error('[i18n] Failed to load saved locale:', err)
  }
})()

// Keep the main process in sync so the native tray menu uses the same
// language (see electron/tray.ts — the main process has no i18next).
try { window.asgard?.setLanguage?.(savedLang) } catch { /* preload not ready */ }

/**
 * Applique une langue, en chargeant son catalogue s'il n'est pas encore là.
 * Renvoie faux quand le catalogue n'a pas pu être chargé : l'écran qui change
 * de langue ne doit pas annoncer un succès que la langue n'a pas eu.
 */
export async function changeLanguage(lang: string): Promise<boolean> {
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    try {
      if (!(await loadLocale(lang))) return false
    } catch (err) {
      console.error('[i18n] Failed to load locale:', err)
      return false
    }
  }
  await i18n.changeLanguage(lang)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('asgard-language', lang)
  }
  // Le menu natif du tray suit la langue choisie ; un échec IPC ne doit pas
  // rejeter en silence (cette promesse n'était jamais attendue).
  try {
    await window.asgard?.setLanguage?.(lang)
  } catch (err) {
    console.error('[i18n] Failed to sync tray language:', err)
  }
  return true
}

export function getCurrentLanguage(): string {
  return i18n.language || 'fr'
}

export default i18n
