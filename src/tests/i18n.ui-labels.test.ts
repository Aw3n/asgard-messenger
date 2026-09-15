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
import i18n, { SUPPORTED_LANGUAGES } from '@/i18n/config'
import { translations } from '@/i18n/translations'

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
      await i18n.changeLanguage(code)
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
      await i18n.changeLanguage(code)
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
      await i18n.changeLanguage(code)
      for (const count of [0, 1, 7]) {
        const rendered = i18n.t('search.resultsCount', { count })
        expect(rendered).not.toContain('{{count}}')
        expect(rendered).toContain(String(count))
      }
    }
  })
})

/**
 * DÉFAUT CONNU, verrouillé tel quel — ce test ne valide pas un comportement
 * voulu, il empêche qu'on l'oublie.
 *
 * Le catalogue porte 7 clés `*_plural` (175 entrées, traduites dans les 25
 * langues) héritées d'i18next v19. `package.json` livre i18next v26 et
 * `config.ts` ne déclare aucune `compatibilityJSON: 'v1'` : v26 cherche
 * `_one`/`_other`/`_few`/`_many` et ne lit jamais `_plural`. Les 175 valeurs
 * sont donc mortes, et l'écran affiche un singulier là où le pluriel est écrit.
 *
 * Corriger n'est PAS un renommage : `MemberList.tsx` appelle
 * `t('common.member_plural')` comme un titre statique (« Membres », sans
 * nombre), et onze langues (pl, cs, sk, uk, sl, lt, lv, ro, ga, mt, hr) ont
 * plus de deux catégories — la valeur `_plural` actuelle y est la forme
 * « many », pas la forme « few ». Chaque clé demande une décision.
 *
 * Quand la correction arrivera, ce test doit passer au rouge : c'est le
 * signal pour le retourner en attendu-vrai plutôt que de le supprimer.
 */
describe('défaut connu : les clés `_plural` du catalogue sont inertes', () => {
  it('rend le singulier même à trois', async () => {
    await i18n.changeLanguage('fr')
    expect(i18n.t('settings.totalDownloads', { count: 3 })).toBe('3 téléchargement')
    expect(i18n.t('calls.participantCount', { count: 3 })).toBe('3 participant')
    // la valeur plurielle existe, mais seulement par son nom littéral
    expect(i18n.t('settings.totalDownloads_plural', { count: 3 })).toBe('3 téléchargements')
  })

  it('laisse `common.member_plural` comme un titre, pas comme un pluriel', async () => {
    await i18n.changeLanguage('fr')
    // c'est l'appel explicite de MemberList.tsx : un renommage automatique
    // des `_plural` le casserait, d'où ce fil dans le test
    expect(i18n.t('common.member_plural')).toBe('Membres')
  })
})
