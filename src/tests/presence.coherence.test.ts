/**
 * Cohérence des statuts de présence — en ligne, absent, occupé, invisible.
 *
 * Ces tests verrouillent la chaîne complète du produit : les quatre statuts que
 * l'utilisateur choisit, ce que le réseau transporte, ce qui revient à
 * l'affichage, et la règle qui décide si une simple activité suffit à montrer
 * quelqu'un « en ligne ». Chacun de ces maillons a été cassé au moins une fois
 * dans une copie locale du mapping (voir src/utils/presence.ts) ; ils sont ici
 * testés ensemble, parce que le défaut réel n'était jamais dans un maillon
 * isolé mais dans leur désaccord.
 */
import { describe, it, expect } from 'vitest'
import {
  toNetworkStatus,
  fromNetworkStatus,
  shouldPromoteToOnline,
  presenceMessage,
  presenceMeta,
  isLivePresence,
  PRESENCE_CHOICES,
  GROUP_PRESENCE_TIMEOUT,
  type NetworkStatus,
} from '@/utils/presence'
import { translations } from '@/i18n/translations'
import { groupService } from '@/services/GroupService'
import { useGroupStore } from '@/stores/groupStore'
import type { UserStatus } from '@/types'

/** Les six valeurs que le store de contacts sait stocker. */
const INTERNAL_STATUSES: UserStatus[] = ['online', 'away', 'busy', 'offline', 'dnd', 'invisible']

describe('toNetworkStatus — statut interne → protocole', () => {
  it('ne transporte que les quatre valeurs connues du réseau', () => {
    const allowed: NetworkStatus[] = ['online', 'away', 'offline', 'dnd']
    for (const status of INTERNAL_STATUSES) {
      expect(allowed).toContain(toNetworkStatus(status))
    }
  })

  it('traduit busy et dnd en « dnd », invisible et offline en « offline »', () => {
    expect(toNetworkStatus('busy')).toBe('dnd')
    expect(toNetworkStatus('dnd')).toBe('dnd')
    expect(toNetworkStatus('invisible')).toBe('offline')
    expect(toNetworkStatus('offline')).toBe('offline')
    expect(toNetworkStatus('away')).toBe('away')
    expect(toNetworkStatus('online')).toBe('online')
  })

  it('fait taire la présence quand le réglage de confidentialité est coupé', () => {
    // La règle doit être dans l'utilitaire unique : trois sites d'émission
    // l'oubliaient et publiaient le vrai statut, DHT compris.
    for (const status of INTERNAL_STATUSES) {
      expect(toNetworkStatus(status, true)).toBe('offline')
    }
  })

  it('rend « en ligne » pour une valeur absente, jamais pour une déclaration muette', () => {
    // Un profil sans statut (ancienne version persistée) reste « en ligne » —
    // c'est le défaut historique du profil, et le changer rendrait des gens
    // injoignables. La confidentialité, elle, a toujours le dernier mot.
    expect(toNetworkStatus(undefined)).toBe('online')
    expect(toNetworkStatus(null)).toBe('online')
    expect(toNetworkStatus('', true)).toBe('offline')
  })
})

describe('fromNetworkStatus — protocole → affichage', () => {
  it('rend le vocabulaire du produit, pas celui du réseau', () => {
    // « dnd » n'existe pas dans l'interface : c'est « occupé ».
    expect(fromNetworkStatus('dnd')).toBe('busy')
    expect(fromNetworkStatus('online')).toBe('online')
    expect(fromNetworkStatus('away')).toBe('away')
    expect(fromNetworkStatus('offline')).toBe('offline')
  })

  it('accepte les statuts internes (un pair plus récent peut les renvoyer)', () => {
    expect(fromNetworkStatus('busy')).toBe('busy')
    expect(fromNetworkStatus('invisible')).toBe('invisible')
  })

  it('normalise la casse et les espaces parasites dans les deux sens', () => {
    expect(fromNetworkStatus(' DND ')).toBe('busy')
    expect(fromNetworkStatus('ONLINE')).toBe('online')
    // Symétrie : une valeur stockée en majuscules par une version antérieure ne
    // doit pas remonter au réseau comme « online » par défaut de `toNetworkStatus`.
    expect(toNetworkStatus(' AWAY ')).toBe('away')
    expect(toNetworkStatus('INVISIBLE')).toBe('offline')
    expect(presenceMeta(' BUSY ').labelKey).toBe('common.busy')
    expect(isLivePresence(' Away ')).toBe(true)
  })

  it('n’invente jamais une présence sur une valeur inconnue', () => {
    // L'ancien comportement stockait la chaîne brute dans contact.status : une
    // valeur inattendue ne s'affichait nulle part et le contact semblait
    // disparaître de toutes les listes.
    expect(fromNetworkStatus('quelque-chose-dautre')).toBe('offline')
    expect(fromNetworkStatus(undefined)).toBe('offline')
    expect(fromNetworkStatus(null)).toBe('offline')
    expect(fromNetworkStatus('')).toBe('offline')
  })
})

describe('aller-retour interne → réseau → interne', () => {
  it('conserve la classe d’affichage pour les quatre statuts proposés', () => {
    // Ce qui compte n'est pas de retrouver la valeur exacte — « invisible »
    // arrive forcément comme « offline » — mais que le LIBELLÉ affiché reste le
    // même des deux côtés, sinon un même contact porte deux noms selon l'écran.
    const display = (s: UserStatus) => presenceMeta(fromNetworkStatus(toNetworkStatus(s))).labelKey
    expect(display('online')).toBe('common.online')
    expect(display('away')).toBe('common.away')
    expect(display('busy')).toBe('common.busy')
    expect(display('invisible')).toBe('common.offline')
  })

  it('est stable sur les quatre valeurs réseau', () => {
    for (const network of ['online', 'away', 'dnd', 'offline'] as NetworkStatus[]) {
      expect(toNetworkStatus(fromNetworkStatus(network))).toBe(network)
    }
  })
})

describe('shouldPromoteToOnline — l’activité ne remplace pas une déclaration', () => {
  const NOW = 1_000_000
  const FRESH = 45_000

  it('promeut quand rien n’a été déclaré (client ancien, pair jamais entendu)', () => {
    expect(shouldPromoteToOnline(undefined, NOW, FRESH)).toBe(true)
  })

  it('respecte une déclaration récente — « absent », « occupé », « invisible »', () => {
    expect(shouldPromoteToOnline(NOW - 1_000, NOW, FRESH)).toBe(false)
    expect(shouldPromoteToOnline(NOW - FRESH, NOW, FRESH)).toBe(false)
  })

  it('laisse retomber sur l’activité quand la déclaration est périmée', () => {
    expect(shouldPromoteToOnline(NOW - FRESH - 1, NOW, FRESH)).toBe(true)
  })
})

describe('presenceMessage — le message collé au statut', () => {
  it('fait primer la partie libre sur la devise du profil', () => {
    expect(presenceMessage({ customStatus: 'En réunion', about: 'Coucou' })).toBe('En réunion')
    expect(presenceMessage({ customStatus: '', about: 'Coucou' })).toBe('Coucou')
    expect(presenceMessage({ about: 'Coucou' })).toBe('Coucou')
  })

  it('rend une valeur absente et non une chaîne vide', () => {
    // Le record DHT garde `statusMessage` tel quel : une chaîne vide écrirait un
    // message vide là où les autres écritures du même record n’en mettraient pas.
    expect(presenceMessage({})).toBeUndefined()
    expect(presenceMessage({ customStatus: '   ', about: '' })).toBeUndefined()
  })
})

describe('PRESENCE_CHOICES — les quatre choix du produit', () => {
  it('propose exactement en ligne, absent, occupé, invisible, dans cet ordre', () => {
    expect(PRESENCE_CHOICES.map((c) => c.value)).toEqual(['online', 'away', 'busy', 'invisible'])
  })

  it('n’expose ni « offline » ni « dnd » comme choix', () => {
    // « hors ligne » ne se choisit pas (on choisit « invisible »), et « dnd » est
    // un terme réseau. Les deux menus qui proposaient ces valeurs-là affichaient
    // un statut que le reste de l'app ne sait pas nommer.
    const values = PRESENCE_CHOICES.map((c) => c.value as string)
    expect(values).not.toContain('offline')
    expect(values).not.toContain('dnd')
  })

  it('traduit chaque libellé dans TOUTES les langues livrées', () => {
    // fallbackLng: 'fr' masquerait silencieusement un oubli : sans ce test, une
    // nouvelle langue afficherait du français sans que rien ne le signale.
    const languages = Object.keys(translations as Record<string, unknown>)
    expect(languages.length).toBeGreaterThanOrEqual(25)
    const keys = new Set(PRESENCE_CHOICES.map((c) => c.labelKey))
    keys.add(presenceMeta('offline').labelKey)
    for (const lang of languages) {
      const catalog = (translations as Record<string, { translation: Record<string, string> }>)[lang].translation
      for (const key of keys) {
        expect(catalog[key], `${lang}.${key}`).toBeTruthy()
      }
    }
  })

  it('utilise des classes de pastille déjà définies, jamais une palette parallèle', () => {
    // Ces classes viennent de globals.css et sont celles de l'avatar : un statut
    // doit avoir la même couleur partout.
    const dots = PRESENCE_CHOICES.map((c) => c.dot)
    expect(dots).toEqual(['status-online', 'status-away', 'status-busy', 'status-offline'])
    expect(presenceMeta('invisible').dot).toBe('status-offline')
    expect(presenceMeta('dnd').dot).toBe('status-busy')
    expect(presenceMeta('inconnu').dot).toBe('status-offline')
  })
})

describe('isLivePresence — ce qui s’affiche tel quel', () => {
  it('compte « absent » et « occupé » comme présents', () => {
    // Les listes ne testaient que `=== 'online'` : un contact absent y
    // apparaissait comme déconnecté, avec sa dernière connexion vue.
    expect(isLivePresence('online')).toBe(true)
    expect(isLivePresence('away')).toBe(true)
    expect(isLivePresence('busy')).toBe(true)
  })

  it('exclut hors ligne, invisible et l’inconnu', () => {
    expect(isLivePresence('offline')).toBe(false)
    expect(isLivePresence('invisible')).toBe(false)
    expect(isLivePresence(undefined)).toBe(false)
    expect(isLivePresence('dnd')).toBe(false)
  })
})

describe('compte des membres présents en groupe', () => {
  it('compte « absent » et « occupé » parmi les présents', () => {
    // getOnlineMembers() ne testait que `status === 'online'` : un membre absent
    // était compté comme déconnecté là où sa fiche de contact l’affichait absent.
    useGroupStore.setState({
      groupPresence: {
        gtest: { a: 'online', b: 'away', c: 'busy', d: 'offline', e: 'invisible' },
      },
    })
    expect(useGroupStore.getState().getOnlineMembers('gtest').sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('rythme de présence en groupe', () => {
  it('re-annonce avant l’expiration de la présence', () => {
    // Le cycle forcé (5 × 30 s = 150 s) dépassait la durée de vie de l'annonce
    // (120 s) : tout membre stable disparaissait de « en ligne » une trentaine de
    // secondes à chaque tour, alors qu'il ne s'était rien passé.
    const cls = (groupService as unknown as { constructor: Record<string, number> }).constructor
    const every = cls.FORCE_BROADCAST_EVERY
    const interval = cls.HEARTBEAT_INTERVAL_MS
    expect(every).toBeGreaterThan(0)
    expect(Number.isFinite(every)).toBe(true)
    expect(every * interval).toBeLessThanOrEqual(GROUP_PRESENCE_TIMEOUT)
  })
})
