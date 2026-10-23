import type { Contact } from '@/types'
import { p2pService } from './P2PService'
import { storageService } from './StorageService'
import { useContactStore } from '@/stores/contactStore'
import { useIdentityStore } from '@/stores/identityStore'

export type ContactRequestDirection = NonNullable<Contact['requestDirection']>

/**
 * Confirme une demande de contact encore en attente.
 *
 * Une demande n'est jamais confirmée par un simple contact:request : le pair
 * qui a ajouté la clé attend une réponse (message, fichier) ou une acceptation
 * explicite. `direction` empêche de confirmer la mauvaise moitié d'un échange
 * croisé — répondre confirme une demande *entrante*, recevoir une réponse
 * confirme une demande *sortante*.
 *
 * Retourne `true` uniquement lors de la transition pending → contact, pour que
 * les appelants puissent accompagner la confirmation (avatar, toast) une seule
 * fois. La persistance Hyperbee est faite ici : le store zustand ne survit qu'en
 * localStorage et ne suffit pas au flux de restauration.
 */
export function confirmPendingContact(
  peerId: string,
  direction: ContactRequestDirection | 'any',
  notifyPeer: boolean
): boolean {
  const store = useContactStore.getState()
  const contact = store.getContact(peerId)
  if (!contact || contact.relation !== 'pending') return false
  if (direction !== 'any' && contact.requestDirection !== direction) return false

  store.updateContact(peerId, {
    relation: 'contact',
    requestDirection: undefined,
    lastSeen: Date.now(),
  })

  const confirmed = useContactStore.getState().getContact(peerId)
  if (confirmed) {
    storageService.saveContact(confirmed).catch((err) => {
      console.warn('[contactRequests] Failed to persist confirmed contact:', err)
    })
  }

  if (notifyPeer) {
    const identity = useIdentityStore.getState().identity
    if (identity) {
      p2pService
        .sendMessage(peerId, 'contact:accept', {
          displayName: identity.profile.displayName,
        })
        .catch(() => {})
    }
  }

  return true
}

/**
 * La demande de ce pair est-elle encore en attente ? `direction` filtre le sens
 * (`incoming` : il nous a ajoutés, `outgoing` : nous l'avons ajouté).
 */
export function hasPendingContact(
  peerId: string,
  direction?: ContactRequestDirection
): boolean {
  const contact = useContactStore.getState().getContact(peerId)
  if (!contact || contact.relation !== 'pending') return false
  return direction === undefined || contact.requestDirection === direction
}
