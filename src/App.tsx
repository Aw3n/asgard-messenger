import React, { useEffect, useCallback, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { AppShell } from '@/components/layout/AppShell'
import { ConversationsPage } from '@/features/chat/ConversationsPage'

// Pages secondaires chargées à la navigation : leur poids (réglages, groupes,
// historique d'appels) ne retarde plus le premier rendu de la messagerie.
const GroupsPage = React.lazy(() =>
  import('@/features/groups/GroupsPage').then((m) => ({ default: m.GroupsPage }))
)
const CallsPage = React.lazy(() =>
  import('@/features/calls/CallsPage').then((m) => ({ default: m.CallsPage }))
)
const SettingsPage = React.lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
)
const ContactsPage = React.lazy(() =>
  import('@/features/contacts/ContactsPage').then((m) => ({ default: m.ContactsPage }))
)
const OnboardingPage = React.lazy(() =>
  import('@/features/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage }))
)
const ChatView = React.lazy(() =>
  import('@/features/chat/ChatView').then((m) => ({ default: m.ChatView }))
)
// Plein écran d'appel et recherche globale : absents du premier rendu, ils
// n'entrent dans le bundle qu'au premier usage.
const CallView = React.lazy(() =>
  import('@/features/calls/components/CallView').then((m) => ({ default: m.CallView }))
)
const SearchModal = React.lazy(() =>
  import('@/components/search/SearchModal').then((m) => ({ default: m.SearchModal }))
)

const RouteFallback: React.FC = () => <div style={{ flex: 1, height: '100%' }} />
const lazyRoute = (page: React.ReactNode) => (
  <React.Suspense fallback={<RouteFallback />}>{page}</React.Suspense>
)

import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { p2pService } from '@/services/P2PService'
import { chatService } from '@/services/ChatService'
import { cryptoService } from '@/services/CryptoService'
import { bytesToHexSafe } from '@/utils/bytes'
import { toNetworkStatus, presenceMessage } from '@/utils/presence'
import { formatWindowTitle } from '@/utils/windowTitle'
import { groupService } from '@/services/GroupService'
import { callService } from '@/services/CallService'
import { fileService } from '@/services/FileService'
import { mediaDeviceService } from '@/services/MediaDeviceService'
import { activityMonitor } from '@/services/ActivityMonitor'
import { ModalContainer } from '@/components/modals/ModalContainer'
import { IncomingCallOverlay } from '@/components/overlays/IncomingCallOverlay'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useCallStore } from '@/stores/callStore'
import i18n from '@/i18n/config'
import type { Contact } from '@/types'

/**
 * App — root component with routing and initialization.
 */
const App: React.FC = () => {
  const navigate = useNavigate()
  const { isSetup, loadIdentity, identity } = useIdentityStore()
  const { theme, setTheme, isSearchOpen, setSearchOpen, settings } = useUIStore()
  const activeCall = useCallStore((s) => s.activeCall)
  // Total des non-lus (1:1 + canaux de groupe) pour le titre de fenêtre.
  const directUnread = useConversationStore((s) =>
    Object.values(s.conversations).reduce(
      (sum, conv) => (conv.type === 'direct' ? sum + conv.unreadCount : sum),
      0,
    )
  )
  const groupUnread = useGroupStore((s) =>
    Object.values(s.groups).reduce(
      (sum, group) => sum + group.channels.reduce((n, channel) => n + channel.unreadCount, 0),
      0,
    )
  )
  // Clé publique Ed25519 pour laquelle la session réseau courant est initialisée
  // (null = aucune). L'effet d'init ne DOIT se relancer que si cette clé change
  // (import d'une nouvelle identité) — surtout pas à chaque nouvelle référence de
  // l'objet `identity` (changement de statut en ligne, édition du profil, mise à
  // jour du avatar). React exécute le cleanup de l'effet précédent à chaque
  // re-run : p2pService/chatService étaient détruits et les intervalles DHT
  // effacés, tandis que le garde-fou « initDone » empêchait toute
  // ré-initialisation. Résultat observable dans les logs : « Stopped monitoring
  // user activity » + « Init blocked: initDone=true » + « peers=0 » jusqu'à la
  // fin de session — l'app survit mais n'écoute plus rien, ne publie plus son
  // statut et ne reçoit plus aucun message, même si le process principal a la
  // connexion. La présence devient alors unilatérale (l'ami nous voit via le
  // DHT tant que le record n'a pas expiré, mais on ne le voit pas).
  const initDone = useRef<string | null>(null)
  // Teardown de la session réseau, invoqué uniquement au démontage réel de App
  // ou lors d'un changement d'identité — jamais au re-run de l'effet d'init.
  const sessionTeardown = useRef<(() => void) | null>(null)
  // Track whether we've verified the identity from disk
  const [identityVerified, setIdentityVerified] = React.useState(false)
  // La recherche ne rejoint le bundle qu'après le premier Ctrl+K, puis reste
  // montée pour laisser jouer son animation de fermeture.
  const [searchMounted, setSearchMounted] = React.useState(false)
  useEffect(() => {
    if (isSearchOpen) setSearchMounted(true)
  }, [isSearchOpen])

  useEffect(() => {
    const dlog = (m: string) => { console.log(m); try { window.asgard.debugLog(m) } catch {} }
    dlog('[App] loadIdentity useEffect triggered')
    // Initialize identity from disk
    loadIdentity().then(() => {
      dlog('[App] loadIdentity complete, setting identityVerified=true')
      setIdentityVerified(true)
    }).catch((err) => {
      console.error('[App] loadIdentity FAILED:', err)
      try { window.asgard.debugLog('[App] loadIdentity FAILED: ' + err) } catch {}
    })
  }, [loadIdentity])

  useEffect(() => {
    // Apply initial theme
    setTheme(theme)
  }, [theme, setTheme])

  // Apply font size to DOM
  useEffect(() => {
    const root = document.documentElement
    const sizes: Record<string, string> = { small: '13px', medium: '15px', large: '17px' }
    root.style.setProperty('--font-size-base', sizes[settings.fontSize] ?? '15px')
  }, [settings.fontSize])

  // Titre de fenêtre : les non-lus restent visibles dans la barre des tâches,
  // l'aperçu Alt+Tab et pour les lecteurs d'écran, même en arrière-plan.
  useEffect(() => {
    document.title = formatWindowTitle(i18n.t('titlebar.appName'), directUnread + groupUnread)
  }, [directUnread, groupUnread, i18n.language])

  // Notification cliquée : sélectionner la destination avant de naviguer,
  // sinon la page s'affiche en gardant l'ancien fil ou l'ancien canal.
  useEffect(() => {
    return window.asgard.notifications.onClick((target) => {
      if (target.groupId && target.channelId) {
        useGroupStore.getState().setActiveGroup(target.groupId)
        useGroupStore.getState().setActiveChannel(target.channelId)
        navigate(`/groups/${target.groupId}/channels/${target.channelId}`)
      } else if (target.conversationId) {
        useConversationStore.getState().setActiveConversation(target.conversationId)
        navigate(`/conversations/${target.conversationId}`)
      }
    })
  }, [navigate])

  // ACCESSIBILITY SETTINGS: toggle hook classes on <html> — the actual rules
  // live in globals.css (highContrast, reducedMotion, keyboardNav, large touch
  // targets). framer-motion animations are covered by MotionConfig below.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('a11y-high-contrast', settings.accessibility.highContrast)
    root.classList.toggle('a11y-reduced-motion', settings.accessibility.reducedMotion)
    root.classList.toggle('a11y-keyboard-nav', settings.accessibility.keyboardNav)
    root.classList.toggle('a11y-large-touch', settings.accessibility.largerTouchTargets)
  }, [
    settings.accessibility.highContrast,
    settings.accessibility.reducedMotion,
    settings.accessibility.keyboardNav,
    settings.accessibility.largerTouchTargets,
  ])

  const identityPublicKey = identity?.keyPair?.publicKey ?? null

  useEffect(() => {
    const dlog = (m: string) => { console.log(m); try { window.asgard.debugLog(m) } catch {} }
    dlog('[App] Init useEffect: isSetup=' + isSetup + ' hasIdentity=' + !!identity + ' identityVerified=' + identityVerified + ' initDone=' + (initDone.current !== null))
    if (!isSetup || !identity) {
      dlog('[App] Init blocked: isSetup=' + isSetup + ' identity=' + !!identity)
      return
    }
    // CRITICAL: Wait for identity to be verified from disk before initializing.
    // This prevents initialization with stale localStorage data.
    if (!identityVerified) {
      dlog('[App] Init blocked: identityVerified=false')
      return
    }
    // Clé de la session : `identity` est non-null ici (garde ci-dessus).
    const pk = identity.keyPair.publicKey
    // CRITICAL: Prevent double initialization (React StrictMode) — la session
    // est déjà ouverte pour CETTE clé publique, il ne faut surtout pas la
    // rouvrir ni la détruire (voir le commentaire sur initDone).
    if (initDone.current === pk) {
      dlog('[App] Init skipped: already initialized for identity ' + pk.slice(0, 16))
      return
    }
    // Changement d'identité (import d'une autre seed phrase) : on démonte la
    // session précédente avant d'ouvrir la nouvelle.
    if (initDone.current !== null) {
      dlog('[App] Identity key changed — tearing down previous network session')
      try { sessionTeardown.current?.() } catch (err) { console.warn('[App] Teardown failed:', err) }
      sessionTeardown.current = null
    }
    initDone.current = pk

    // DHT status re-publish interval (declared here for cleanup access)
    let dhtRepublishInterval: ReturnType<typeof setInterval> | undefined
    // DHT profile refresh interval — fetch contacts' profiles as fallback for presence
    let dhtProfileRefreshInterval: ReturnType<typeof setInterval> | undefined
    // Retrait des sondes de présence déclenchées par le focus / le retour réseau
    let removePresenceTriggers: (() => void) | undefined

    // Nettoyage de la session : stocké dans une ref pour n'être invoqué qu'au
    // démontage de App (ou changement d'identité), jamais par React à la suite
    // d'un simple changement de référence de l'objet identity.
    sessionTeardown.current = () => {
      activityMonitor.stop()
      p2pService.destroy()
      chatService.destroy()
      if (dhtRepublishInterval) clearInterval(dhtRepublishInterval)
      if (dhtProfileRefreshInterval) clearInterval(dhtProfileRefreshInterval)
      removePresenceTriggers?.()
      dhtRepublishInterval = undefined
      dhtProfileRefreshInterval = undefined
      removePresenceTriggers = undefined
      sessionTeardown.current = null
    }

    // Initialize P2P services when identity is ready
    const init = async () => {
      const dlog = (msg: string) => { console.log(msg); window.asgard.debugLog(msg) }
      const derr = (msg: string, err?: unknown) => { console.error(msg, err); window.asgard.debugLog(msg + (err ? ' ' + err : '')) }

      // ── PHASE 1: Import crypto keys FIRST ──
      dlog('[App] ═══ PHASE 1: Import crypto keys ═══')
      try {
        const electronIdentity = await window.asgard.identity.load()
        dlog('[App] Electron identity loaded: ' + (electronIdentity ? 'yes' : 'no'))
        if (electronIdentity?.keyPair?.secretKey) {
          const pkHex = bytesToHexSafe(electronIdentity.keyPair.publicKey)
          const skHex = bytesToHexSafe(electronIdentity.keyPair.secretKey)
          dlog('[App] Importing crypto key pair, pkHex: ' + pkHex.slice(0, 32) + '...')
          await cryptoService.importKeyPair(pkHex, skHex)
          dlog('[App] Crypto key pair imported successfully')
        } else if (identity.keyPair.secretKey) {
          await cryptoService.importKeyPair(
            bytesToHexSafe(identity.keyPair.publicKey),
            bytesToHexSafe(identity.keyPair.secretKey)
          )
        } else {
          derr('[App] No secretKey available — signing will fail')
        }
      } catch (err) {
        derr('[App] Failed to import crypto key pair:', err)
      }

      // ── PHASE 2: Start network AFTER crypto is ready ──
      dlog('[App] ═══ PHASE 2: Start network ═══')
      // CRITICAL: brancher les listeners du renderer AVANT de démarrer le swarm.
      // `network:setIdentity` démarre Hyperswarm : un pair qui se connecte dans
      // la seconde qui suit ne serait JAMAIS connu du renderer (les évènements
      // `network:peer`/`network:peerIdentified` ne sont pas rejoués) — le socket
      // vivrait dans le process principal pendant que l'UI resterait à
      // `peers=0`, sans émettre de présence ni recevoir de message. C'est
      // exactement le « je le vois en ligne mais je ne peux pas lui parler ».
      // initialize() est idempotent et ne fait qu'abonner + réconcilier l'état.
      await p2pService.initialize()
      try {
        const pkHex = bytesToHexSafe(identity.keyPair.publicKey)
        dlog('[App] Setting network identity: ' + pkHex.slice(0, 32) + '...')
        await window.asgard.network.setIdentity(pkHex)
        dlog('[App] Network identity set')
      } catch (err) {
        derr('[App] Failed to set network identity:', err)
      }

      // CRITICAL: Publish profile + status to DHT IN PARALLEL.
      // NON BLOQUANT : la publication attend le bootstrap DHT ; la garder en
      // await retardait d'autant le joinPeer/les topics, donc la connexion aux
      // contacts. On publie en tâche de fond et on enchaîne la découverte.
      const statusMessage = presenceMessage(identity.profile)
      // PRIVACY + single mapping (src/utils/presence.ts): the DHT record is public,
      // so it has to honour `privacy.onlineStatus` exactly like the P2P channel.
      // This chain used to ignore the setting — hiding our presence only muted our
      // peers while anyone looking up our public key still read the real status.
      const networkStatus = toNetworkStatus(
        identity.profile.status,
        !useUIStore.getState().settings.privacy.onlineStatus,
      )
      dlog('[App] Publishing profile + status to DHT (background): ' + identity.profile.displayName)
      void Promise.allSettled([
        window.asgard.network.publishProfile(identity.profile.displayName),
        window.asgard.network.publishStatus(networkStatus, statusMessage),
      ]).then(([profilePub, statusPub]) => {
        // HONNÊTETÉ DU DIAGNOSTIC : un `mutablePut` rejeté par les nœuds DHT
        // (SEQ_REUSED / SEQ_TOO_LOW) ne remonte JAMAIS d'erreur côté hyperdht —
        // la promise se résout quelle que soit l'issue. Seul le booléen retourné
        // par le service (qui relit l'enregistrement pour vérifier l'atterrissage)
        // dit la vérité. Sans ce contrôle, un statut gelé côté réseau reste invisible.
        const pubOk = (r: PromiseSettledResult<boolean>) => r.status === 'fulfilled' && r.value === true
        if (pubOk(profilePub) && pubOk(statusPub)) {
          dlog('[App] Profile + status published to DHT: ' + networkStatus)
        } else {
          dlog('[App] ⚠️ DHT publish INCOMPLETE | profile=' + pubOk(profilePub) + ' status=' + pubOk(statusPub) + ' — nos contacts ne nous verront pas à jour (vérifier la connexion DHT/pare-feu)')
        }
      })

      // Now initialize all services (peers may connect from here on)
      dlog('[App] Initializing services...')
      // p2pService.initialize() a déjà été appelé avant setIdentity (garde
      // anti-course d'abonnement) — l'appeler ici ne serait qu'un no-op.
      chatService.initialize()
      groupService.initialize()
      callService.initialize()
      fileService.initialize()
      // Initialize media device detection (non-blocking, no await needed)
      mediaDeviceService.initialize().catch(() => {})
      // Start activity monitor for auto-away detection
      activityMonitor.start()
      dlog('[App] Services initialized')

      // REJOU : les pairs connectés avant l'abonnement de ChatService /
      // GroupService / CallService doivent leur être signalés — leur propre map
      // interne est encore vide alors que la connexion existe.
      void p2pService.syncPeersFromMain(true).catch(() => {})

      // Le contrôle du pare-feu (potentiellement une élévation UAC) est lancé
      // APRÈS la découverte : il ne doit jamais retarder la connexion aux pairs.

      // ── PHASE 2.5: Restore contacts from Hyperbee storage ──
      dlog('[App] ═══ PHASE 2.5: Restore contacts from Hyperbee ═══')
      try {
        const storedContacts = await window.asgard.storage.getContacts() as Array<{
          publicKey: string
          displayName: string
          status?: string
          relation?: string
          requestDirection?: 'incoming' | 'outgoing'
          verified?: boolean
          addedAt?: number
          lastSeen?: number
          statusMessage?: string
        }>
        if (storedContacts && storedContacts.length > 0) {
          const addContact = useContactStore.getState().addContact
          let restored = 0
          for (const c of storedContacts) {
            // Only restore if not already in store
            if (!useContactStore.getState().getContact(c.publicKey)) {
              addContact({
                publicKey: c.publicKey,
                displayName: c.displayName,
                // CRITICAL: Always restore as 'offline' — the real status will be
                // updated via presence:update / peer:identified events once the
                // peer actually connects. Restoring the last-known status (e.g.
                // 'online') creates ghost contacts that appear online when they're not.
                status: 'offline',
                relation: (c.relation as Contact['relation']) || 'contact',
                requestDirection: c.requestDirection,
                verified: c.verified ?? false,
                addedAt: c.addedAt ?? Date.now(),
                lastSeen: c.lastSeen,
              })
              restored++
            }
          }
          if (restored > 0) {
            dlog('[App] Restored ' + restored + ' contacts from Hyperbee storage')
          }
        }
      } catch (err) {
        derr('[App] Failed to restore contacts from Hyperbee:', err)
      }

      // CRITICAL: Reset contacts to 'offline' at startup. Le statut DHT, lu en
      // tâche de fond juste après, pourra les repasser en ligne sans jamais
      // contredire un signal P2P frais (voir ChatService.applyDhtProfile).
      {
        const contacts = useContactStore.getState().contacts
        let resetCount = 0
        for (const [publicKey, contact] of Object.entries(contacts)) {
          if (contact.relation === 'blocked') continue
          if (contact.status !== 'offline') {
            useContactStore.getState().setContactStatus(publicKey, 'offline')
            resetCount++
          }
        }
        if (resetCount > 0) dlog('[App] Reset ' + resetCount + ' contacts to offline')
      }

      // Rafraîchit la présence des contacts que le P2P n'atteint pas : un pair
      // connecté ou qui vient de déclarer son statut est ignoré (le heartbeat
      // 5 s fait autorité, inutile d'interroger le DHT).
      const refreshContactsFromDht = async (): Promise<void> => {
        const contacts = Object.values(useContactStore.getState().contacts)
          .filter((c) => c.relation !== 'blocked' && !chatService.isPeerReachable(c.publicKey))
        if (contacts.length === 0) return
        await Promise.allSettled(contacts.map(async (contact) => {
          try {
            const profile = await window.asgard.network.fetchProfile(contact.publicKey)
            if (profile?.identityPk && profile.identityPk !== contact.publicKey) {
              const warn = '[App] ⚠️ DHT record key mismatch for ' + contact.publicKey.slice(0, 16) + ' — entrée obsolète (identité régénérée de son côté), demander une nouvelle invitation'
              console.warn(warn)
              try { window.asgard.debugLog(warn) } catch {}
            }
            if (chatService.applyDhtProfile(contact.publicKey, profile)) {
              const status = useContactStore.getState().getContact(contact.publicKey)?.status
              dlog('[App] DHT presence: ' + contact.publicKey.slice(0, 16) + ' → ' + status)
            }
          } catch (err) {
            console.warn('[App] DHT fetch failed for', contact.publicKey.slice(0, 16) + ':', err)
          }
        }))
      }

      // Replay identities and presence events that arrived before contacts were hydrated.
      chatService.flushPendingPresence()

      // ── PHASE 3: Fast peer discovery + connection ──
      // OPTIMIZATION: Per Hyperswarm docs, joinPeer() establishes direct
      // connections bypassing DHT topic lookup — the fastest way to connect.
      // We call joinPeer for ALL contacts (not just favorites) first, then
      // join all topics in parallel. This cuts startup time from O(n) sequential
      // joins to O(1) parallel.
      dlog('[App] ═══ PHASE 3: Fast peer discovery + connection ═══')
      // Tous les contacts non bloqués, y compris les demandes en attente (leur
      // réponse doit pouvoir arriver), et jamais la liste filtrée par la
      // recherche UI.
      const allContacts = Object.values(useContactStore.getState().contacts)
        .filter((c) => c.relation !== 'blocked')

      // STEP 1: joinPeer for ALL contacts using the CORRECT Noise public key,
      // in parallel — the IPC round-trip per derivation used to be sequential.
      // Per Hyperswarm docs: "joinPeer will ensure that peer connections are
      // reestablished in the event of failures" — ideal for auto-reconnect.
      //
      // CRITICAL: The Noise public key is NOT sha256(ed25519PublicKey).
      // It is HyperDHT.keyPair(sha256(ed25519PublicKey)).publicKey — an Ed25519
      // keypair derived from the seed. Using the raw sha256 hash means joinPeer()
      // connects to a non-existent peer and peers NEVER discover each other.
      const joinResults = await Promise.allSettled(allContacts.map(async (contact) => {
        const noiseKeyHex = await window.asgard.network.deriveNoisePublicKey(contact.publicKey)
        await p2pService.joinPeer(noiseKeyHex)
      }))
      const joinPeerCount = joinResults.filter((r) => r.status === 'fulfilled').length
      if (joinPeerCount > 0) {
        dlog('[App] joinPeer initiated for ' + joinPeerCount + '/' + allContacts.length + ' contacts (parallel)')
      }
      for (const r of joinResults) {
        if (r.status === 'rejected') console.warn('[App] joinPeer failed for a contact:', r.reason)
      }

      // LECTURE DHT EN TÂCHE DE FOND : elle n'a plus besoin de précéder la
      // connexion P2P. Chaque profil reçu est appliqué sans écraser un signal
      // P2P plus frais.
      void refreshContactsFromDht()

      // STEP 2: Join GLOBAL discovery topic + all conversation topics IN PARALLEL
      // Each joinTopic awaits discovery.flushed() internally, so running them
      // concurrently avoids blocking on sequential DHT announces.
      const topicPromises: Promise<void>[] = []

      // Global discovery topic
      topicPromises.push((async () => {
        try {
          const globalTopicBytes = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode('asgard:global:discovery')
          )
          const globalTopic = Array.from(new Uint8Array(globalTopicBytes))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
          await p2pService.joinTopic(globalTopic)
          console.log('[App] Joined global discovery topic')
        } catch (err) {
          console.warn('[App] Failed to join global discovery topic:', err)
        }
      })())

      // Conversation topics for all contacts
      for (const contact of allContacts) {
        topicPromises.push((async () => {
          try {
            const topic = await cryptoService.deriveConversationTopic(
              identity.keyPair.publicKey,
              contact.publicKey
            )
            await p2pService.joinTopic(topic)
          } catch (err) {
            console.warn('[App] Failed to join topic for contact:', contact.publicKey.slice(0, 16), err)
          }
        })())
      }

      // Groupes existants : leurs topics de découverte ne vivaient que le temps
      // d'une session. Sans ce re-join, les membres qui ne sont pas aussi des
      // contacts 1:1 ne pouvaient pas se retrouver après un redémarrage.
      topicPromises.push(
        groupService.joinAllGroupTopics().catch((err) => {
          console.warn('[App] Failed to join group discovery topics:', err)
        })
      )

      await Promise.allSettled(topicPromises)
      if (allContacts.length > 0) {
        console.log('[App] Joined Hyperswarm topics for', allContacts.length, 'contacts (parallel)')
      }

      // STEP 3: Now that topics are joined and direct connections are established,
      // re-identify peers so they receive our identity. This is more effective
      // than calling reidentifyAll() before topics are joined (old approach).
      try {
        await window.asgard.network.reidentifyAll()
      } catch (err) {
        derr('[App] Failed to re-identify peers:', err)
      }

      // Broadcast initial presence to all connected peers
      chatService.broadcastPresence().catch(console.error)
      // Groupes : annonce immédiate plutôt qu'au premier tick de 30 s.
      groupService.announcePresenceNow()

      // ── PHASE 4: Delayed re-identify + presence broadcast (multi-pass) ──
      // OPTIMIZATION: Three fast passes instead of one slow pass.
      // Pass 1 (1s): catches peers that connected quickly after initial reidentify.
      // Pass 2 (3s): catches slower cross-border NAT traversal peers.
      // Pass 3 (6s): final safety net for very slow connections.
      const delayedPasses = [1000, 3000, 6000]
      for (const delay of delayedPasses) {
        setTimeout(async () => {
          try {
            await window.asgard.network.reidentifyAll()
            chatService.broadcastPresence().catch(console.error)
            console.log('[App] Delayed re-identify pass at ' + delay + 'ms complete')
          } catch (err) {
            console.warn('[App] Delayed re-identify failed at ' + delay + 'ms:', err)
          }
        }, delay)
      }

      // ── PERIODIC DHT STATUS RE-PUBLISH ──
      // Re-publish status to DHT every 30 seconds to prevent stale profiles.
      // DHT mutable records have a TTL — if not republished, they expire.
      // Republishing every 30 seconds ensures contacts always see fresh status.
      // CRITICAL: This is the PRIMARY presence signal for multidirectional detection.
      dhtRepublishInterval = setInterval(async () => {
        try {
          // CRITICAL: Use getState() to get the latest identity, not the captured closure value.
          // This ensures we publish the current status even if the user changed it.
          const latestIdentity = useIdentityStore.getState().identity
          if (!latestIdentity) return
          const currentStatus = latestIdentity.profile.status || 'online'
          // PRIVACY: same gate as the first publish and as every P2P emission —
          // this loop runs every 30 s and used to leak the real status of a user
          // who had hidden their presence, undoing the silence 30 seconds later.
          const networkStatus = toNetworkStatus(
            currentStatus,
            !useUIStore.getState().settings.privacy.onlineStatus,
          )
          const statusMessage = presenceMessage(latestIdentity.profile)
          const published = await window.asgard.network.publishStatus(networkStatus, statusMessage)
          // Le booléen est le SEUL indicateur fiable : hyperdht ne remonte
          // jamais un rejet de nœud (SEQ_REUSED/SEQ_TOO_LOW). Un « false »
          // répété signifie que notre statut ne parvient pas au réseau — donc
          // aucun contact ne peut nous voir, même si l'app tourne.
          if (published) {
            console.log('[App] DHT status re-published:', networkStatus, 'at', new Date().toISOString())
          } else {
            const warn = '[App] ⚠️ DHT status NOT published (' + networkStatus + ') — notre enregistrement réseau reste périmé, les contacts nous verront hors ligne'
            console.warn(warn)
            try { window.asgard.debugLog(warn) } catch {}
          }
        } catch (err) {
          console.warn('[App] Failed to re-publish DHT status:', err)
        }
      }, 30 * 1000) // Every 30 seconds

      // ── PERIODIC DHT PROFILE REFRESH ──
      // Toutes les 30 s, mais uniquement pour les contacts que le P2P n'atteint
      // pas : un pair connecté rejoue sa présence toutes les 5 s. Le DHT reste
      // le filet de sécurité (NAT à sens unique, pare-feu) et son cache de 20 s
      // ne masque plus un cycle sur deux.
      dhtProfileRefreshInterval = setInterval(() => {
        void refreshContactsFromDht()
      }, 30 * 1000)

      // Retour réseau / retour au premier plan : interroge immédiatement les
      // contacts non joignables au lieu d'attendre le prochain tick de 30 s.
      const handleOnline = () => {
        chatService.publishDhtStatus().catch(() => {})
        void refreshContactsFromDht()
      }
      const handleVisibility = () => {
        if (document.visibilityState !== 'visible') return
        chatService.publishDhtStatus().catch(() => {})
        void refreshContactsFromDht()
      }
      // Revenir sur la fenêtre (sans changement de visibilité) doit aussi
      // rafraîchir la présence : le cache DHT de 20 s évite toute rafale.
      const handleFocus = () => {
        void refreshContactsFromDht()
      }
      window.addEventListener('online', handleOnline)
      document.addEventListener('visibilitychange', handleVisibility)
      window.addEventListener('focus', handleFocus)
      removePresenceTriggers = () => {
        window.removeEventListener('online', handleOnline)
        document.removeEventListener('visibilitychange', handleVisibility)
        window.removeEventListener('focus', handleFocus)
      }

      // ── PHASE 2.3: Firewall (tâche de fond) ──
      // Le contrôle peut déclencher une élévation UAC : il ne doit jamais
      // retarder la connexion aux pairs, désormais lancée.
      void (async () => {
        try {
          const fwStatus = await window.asgard.firewall.getStatus()
          if (fwStatus === 'not-configured') {
            dlog('[App] Firewall not configured — attempting automatic configuration...')
            // Try silent configuration first (works if app has admin rights)
            await window.asgard.firewall.configure()
            // Re-check after configuration attempt
            const fwStatusAfter = await window.asgard.firewall.getStatus()
            if (fwStatusAfter === 'not-configured') {
              // Still not configured — try UAC elevation automatically
              dlog('[App] Silent config failed — trying UAC elevation...')
              const uacResult = await window.asgard.firewall.runAsAdmin()
              if (uacResult) {
                dlog('[App] Firewall configured successfully via UAC elevation')
                const addToast = useUIStore.getState().addToast
                addToast({ type: 'success', title: i18n.t('settings.firewallSuccess'), message: i18n.t('settings.firewallConfigured') })
              } else {
                dlog('[App] Firewall UAC elevation failed or was cancelled')
                const addToast = useUIStore.getState().addToast
                addToast({ type: 'warning', title: i18n.t('settings.firewallNotConfigured'), message: i18n.t('settings.firewallManualHint') })
              }
            } else {
              dlog('[App] Firewall configured successfully (silent)')
            }
          }
        } catch (err) {
          console.warn('[App] Firewall check failed:', err)
        }
      })()
    }

    init().catch((err) => {
      console.error('[App] Network session initialization failed:', err)
      try { window.asgard.debugLog('[App] Network session initialization failed: ' + err) } catch {}
      // Ne pas laisser le garde-fou verrouillé sur une session qui n'a pas pu
      // s'ouvrir, sinon plus aucune présence ni aucun échange jusqu'au
      // redémarrage de l'application.
      activityMonitor.stop()
      if (dhtRepublishInterval) clearInterval(dhtRepublishInterval)
      if (dhtProfileRefreshInterval) clearInterval(dhtProfileRefreshInterval)
      removePresenceTriggers?.()
      removePresenceTriggers = undefined
      sessionTeardown.current = null
      if (initDone.current === pk) initDone.current = null
    })

    // PAS de fonction de cleanup ici : c'était la cause de la perte
    // bidirectionnelle de la présence (voir la note sur `initDone`). Le
    // démontage se fait via l'effet dédié ci-dessous.
  }, [isSetup, identityPublicKey, identityVerified])

  // Nettoyage de la session réseau à la fermeture réelle de la fenêtre.
  // On n'utilise PAS le cleanup d'un effet « au démontage » : React 18 en mode
  // StrictMode simule un démontage/remontage de App au démarrage, ce qui
  // détruirait les services juste après leur initialisation (le même piège que
  // celui décrit plus haut). `beforeunload` n'est jamais simulé.
  useEffect(() => {
    const handleUnload = () => {
      try { sessionTeardown.current?.() } catch (err) { console.warn('[App] Session teardown failed:', err) }
      initDone.current = null
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // Ctrl+K shortcut for global search
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    },
    [setSearchOpen]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <MotionConfig reducedMotion={settings.accessibility.reducedMotion ? 'always' : 'never'}>
      {searchMounted && (
        <React.Suspense fallback={null}>
          <SearchModal isOpen={isSearchOpen} onClose={() => setSearchOpen(false)} />
        </React.Suspense>
      )}
      <ModalContainer />
      <IncomingCallOverlay />
      {activeCall && (
        <React.Suspense fallback={null}>
          <CallView />
        </React.Suspense>
      )}
      <ErrorBoundary>
        <Routes>
          {/* Onboarding — no shell */}
          <Route
            path="/onboarding"
            element={isSetup ? <Navigate to="/conversations" replace /> : lazyRoute(<OnboardingPage />)}
          />

          {/* Main app — with shell */}
          <Route
            element={isSetup ? <AppShell /> : <Navigate to="/onboarding" replace />}
          >
            <Route index element={<Navigate to="/conversations" replace />} />
            <Route path="/conversations" element={<ConversationsPage />}>
              <Route path=":conversationId" element={lazyRoute(<ChatView />)} />
            </Route>
            <Route path="/contacts" element={lazyRoute(<ContactsPage />)} />
            <Route path="/groups" element={lazyRoute(<GroupsPage />)}>
              <Route path=":groupId" element={lazyRoute(<GroupsPage />)} />
              <Route path=":groupId/channels/:channelId" element={lazyRoute(<GroupsPage />)} />
            </Route>
            <Route path="/calls" element={lazyRoute(<CallsPage />)} />
            <Route path="/settings" element={lazyRoute(<SettingsPage />)} />
            <Route path="/profile" element={<Navigate to="/settings" replace />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </MotionConfig>
  )
}

export default App
