/**
 * Ce que l'écran voit vraiment — les libellés corrigés, rendus par i18next.
 *
 * `check-i18n-labels.mjs` et `audit-languages.mjs` lisent le catalogue comme du
 * texte : ils garantissent qu'une clé existe dans les 25 blocs. Ça ne suffit
 * pas. Le catalogue est écrit en clés plates (`"contacts.tabBlocked": "…"`),
 * alors qu'i18next découpe les clés sur `.` par défaut ; et `fallbackLng: 'fr'`
 * fait afficher le français à un utilisateur maltais pour une clé que personne
 * n'a remarquée comme absente. Enfin une valeur avec `{{count}}` mal orthographié
 * passe tous les audits et affiche `{{count}}` à l'écran.
 *
 * Ces tests demandent donc à la VRAIE instance, dans les VRAIES langues, le
 * texte de chaque libellé corrigé, et comparent à la valeur du catalogue : ce
 * que la machine rend doit être ce que l'humain a écrit, langue par langue.
 */
import { describe, it, expect } from 'vitest'
import i18n, { changeLanguage, SUPPORTED_LANGUAGES } from '@/i18n/config'
import { translations } from '@/i18n/translations'

// Les catalogues hors français arrivent par chunk : `changeLanguage` expose une
// promesse qui se résout une fois la langue effective, et le rendu ci-dessous
// attend ce point avant d'interroger i18next.

type Blocks = Record<string, { translation: Record<string, string> }>
const CATALOG = translations as unknown as Blocks

/** Les identifiants d'énumération qui ne doivent JAMAIS paraître tels quels. */
const RAW_IDENTIFIERS = [
  'all', 'online', 'favorites', 'blocked', 'dark', 'light', 'system',
  'small', 'medium', 'large', 'navigate', 'open',
]

/** Clés touchées par la correction des libellés en dur. */
const LABEL_KEYS = [
  'contacts.tabBlocked',
  'settings.all',
  'settings.favorites',
  'common.online',
  'settings.theme',
  'settings.dark',
  'settings.light',
  'settings.system',
  'settings.fontSize',
  'settings.fontSmall',
  'settings.fontMedium',
  'settings.fontLarge',
  'search.navigate',
  'search.open',
  'search.contacts',
  'search.messages',
  'common.muted',
  'groups.broadcastModeHint',
]

describe('rendu i18next des libellés corrigés', () => {
  for (const { code } of SUPPORTED_LANGUAGES) {
    it(`${code} — chaque libellé rend sa valeur du catalogue`, async () => {
      await changeLanguage(code)
      for (const key of LABEL_KEYS) {
        const expected = CATALOG[code]?.translation[key]
        expect(expected, `le catalogue ${code} n'a pas « ${key} »`).toBeTruthy()
        const rendered = i18n.t(key)
        // inégal à la valeur du catalogue ⇒ fallback français silencieux, ou
        // clé à points que i18next n'a pas su résoudre
        expect(rendered, `${code} : « ${key} » rend « ${rendered} » au lieu de « ${expected} »`).toBe(expected)
      }
    })
  }

  it('aucun onglet, thème ni taille ne rend son identifiant brut', async () => {
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      for (const key of LABEL_KEYS) {
        const rendered = i18n.t(key)
        expect(RAW_IDENTIFIERS, `${code} : « ${key} » affiche l'identifiant « ${rendered} »`).not.toContain(rendered)
      }
    }
  })

  it('le compteur de résultats s\'interprète dans les 25 langues', async () => {
    // une seule clé, sans forme plurielle : i18next v26 cherche
    // `search.resultsCount_one`/`_other` puis retombe sur la base, et la
    // tournure « Résultats : 3 » est correcte quel que soit le nombre
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      for (const count of [0, 1, 7]) {
        const rendered = i18n.t('search.resultsCount', { count })
        expect(rendered).not.toContain('{{count}}')
        expect(rendered).toContain(String(count))
      }
    }
  })
})

/**
 * Les six libellés de comptage passent par le pluriel d'i18next.
 *
 * Le catalogue a longtemps porté des clés `*_plural` héritées d'i18next v19 :
 * v26 ne lit que `_one`/`_two`/`_few`/`_many`/`_other`, donc l'écran affichait
 * le singulier à toutes les valeurs (« 3 téléchargement »). La migration a
 * écrit chaque catégorie que `Intl.PluralRules` peut sélectionner ; ce test
 * interroge la vraie instance, dans les 25 langues, et compare à la valeur du
 * catalogue pour chaque catégorie — pas seulement au français.
 */
const COUNTED_KEYS = [
  'calls.participantCount',
  'settings.failedTransfers',
  'settings.selectedCount',
  'settings.totalDownloads',
  'settings.totalTransfers',
  'settings.trashItemsCount',
]

describe('pluriels du catalogue', () => {
  it('rend le pluriel écrit en français', async () => {
    await changeLanguage('fr')
    expect(i18n.t('settings.totalDownloads', { count: 3 })).toBe('3 téléchargements')
    expect(i18n.t('calls.participantCount', { count: 3 })).toBe('3 participants')
    // zéro est singulier en français
    expect(i18n.t('calls.participantCount', { count: 0 })).toBe('0 participant')
  })

  it('garde `common.members` comme un titre statique', async () => {
    await changeLanguage('fr')
    // MemberList.tsx affiche cette clé sans nombre : c'est le titre de section
    expect(i18n.t('common.members')).toBe('Membres')
  })

  it('sélectionne la catégorie CLDR de chaque langue', async () => {
    const counts = [0, 1, 2, 3, 5, 11, 20, 21, 25, 100]
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      const catalog = CATALOG[code]?.translation
      expect(catalog, `catalogue ${code} absent`).toBeTruthy()
      const rules = new Intl.PluralRules(code)
      for (const key of COUNTED_KEYS) {
        for (const count of counts) {
          const category = rules.select(count)
          const template = category === 'one'
            ? catalog[key]
            : catalog[`${key}_${category}`]
          expect(
            template,
            `${code} : ${key} n'a pas de forme « ${category} » (compte ${count})`
          ).toBeTruthy()
          const expected = template!.split('{{count}}').join(String(count))
          const rendered = i18n.t(key, { count })
          expect(rendered, `${code} : ${key} à ${count}`).toBe(expected)
          expect(rendered).toContain(String(count))
          expect(rendered).not.toContain('{{count}}')
        }
      }
    }
  })
})
