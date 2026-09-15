import React, { useEffect, useCallback, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { AppShell } from '@/components/layout/AppShell'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
import { ConversationsPage } from '@/features/chat/ConversationsPage'
import { ChatView } from '@/features/chat/ChatView'
import { ContactsPage } from '@/features/contacts/ContactsPage'
import { GroupsPage } from '@/features/groups/GroupsPage'
import { CallsPage } from '@/features/calls/CallsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { useContactStore } from '@/stores/contactStore'
import { p2pService } from '@/services/P2PService'
import { chatService } from '@/services/ChatService'
import { cryptoService } from '@/services/CryptoService'
import { bytesToHexSafe } from '@/utils/bytes'
import { toNetworkStatus, fromNetworkStatus, presenceMessage } from '@/utils/presence'
import { groupService } from '@/services/GroupService'
import { callService } from '@/services/CallService'
import { fileService } from '@/services/FileService'
import { mediaDeviceService } from '@/services/MediaDeviceService'
import { activityMonitor } from '@/services/ActivityMonitor'
import { SearchModal } from '@/components/search/SearchModal'
import { ModalContainer } from '@/components/modals/ModalContainer'
import { IncomingCallOverlay } from '@/components/overlays/IncomingCallOverlay'
import { CallView } from '@/features/calls/components/CallView'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useCallStore } from '@/stores/callStore'

/**
 * App — root component with routing and initialization.
 */
const App: React.FC = () => {
  const { isSetup, loadIdentity, identity } = useIdentityStore()
  const { theme, setTheme, isSearchOpen, setSearchOpen, settings } = useUIStore()
  const activeCall = useCallStore((s) => s.activeCall)
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

    // Nettoyage de la session : stocké dans une ref pour n'être invoqué qu'au
    // démontage de App (ou changement d'identité), jamais par React à la suite
    // d'un simple changement de référence de l'objet identity.
    sessionTeardown.current = () => {
      activityMonitor.stop()
      p2pService.destroy()
      chatService.destroy()
      if (dhtRepublishInterval) clearInterval(dhtRepublishInterval)
      if (dhtProfileRefreshInterval) clearInterval(dhtProfileRefreshInterval)
      dhtRepublishInterval = undefined
      dhtProfileRefreshInterval = undefined
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

      // CRITICAL: Publish profile + status to DHT IN PARALLEL for faster startup.
      // Both operations wait for DHT bootstrap internally; running them concurrently
      // saves ~1-2s vs sequential awaits.
      const statusMessage = presenceMessage(identity.profile)
      // PRIVACY + single mapping (src/utils/presence.ts): the DHT record is public,
      // so it has to honour `privacy.onlineStatus` exactly like the P2P channel.
      // This chain used to ignore the setting — hiding our presence only muted our
      // peers while anyone looking up our public key still read the real status.
      const networkStatus = toNetworkStatus(
        identity.profile.status,
        !useUIStore.getState().settings.privacy.onlineStatus,
      )
      dlog('[App] Publishing profile + status to DHT (parallel): ' + identity.profile.displayName)
      const [profilePub, statusPub] = await Promise.allSettled([
        window.asgard.network.publishProfile(identity.profile.displayName),
        window.asgard.network.publishStatus(networkStatus, statusMessage),
      ])
      // HONNÊTETÉ DU DIAGNOSTIC : un `mutablePut` rejeté par les nœuds DHT
      // (SEQ_REUSED / SEQ_TOO_LOW) ne JAMAIS d'erreur côté hyperdht — la promise
      // se résout quelle que soit l'issue. Seul le booléen retourné par le
      // service (qui relit l'enregistrement pour vérifier l'atterrissage) dit la
      // vérité. Sans ce contrôle, un statut gelé côté réseau reste invisible.
      const pubOk = (r: PromiseSettledResult<boolean>) => r.status === 'fulfilled' && r.value === true
      if (pubOk(profilePub) && pubOk(statusPub)) {
        dlog('[App] Profile + status published to DHT: ' + networkStatus)
      } else {
        dlog('[App] ⚠️ DHT publish INCOMPLETE | profile=' + pubOk(profilePub) + ' status=' + pubOk(statusPub) + ' — nos contacts ne nous verront pas à jour (vérifier la connexion DHT/pare-feu)')
      }

      // ── PHASE 2.1: Fetch contacts' DHT profiles for fast presence detection ──
      // OPTIMIZATION: Fetch DHT profiles IN PARALLEL right after publishing ours.
      // This gives us the last known status of each contact BEFORE P2P connects.
      // When P2P eventually connects, the real presence:update will override this.
      // But for the first few seconds (while P2P negotiates NAT), contacts will
      // show their DHT status instead of 'offline'.
      dlog('[App] ═══ PHASE 2.1: Fetch contacts DHT profiles ═══')
      // NB: on ne passe PAS par getFilteredContacts() — cette liste dépend de la
      // recherche en cours dans l'UI, ce qui ferait disparaître la présence de
      // nos contacts le temps d'une frappe.
      const contactsForDht = Object.values(useContactStore.getState().contacts)
        .filter((c) => c.relation !== 'blocked')
      const dhtProfileResults = new Map<string, { status?: string; displayName?: string; timestamp?: number; identityPk?: string }>()
      if (contactsForDht.length > 0) {
        await Promise.allSettled(contactsForDht.map(async (contact) => {
          try {
            const profile = await window.asgard.network.fetchProfile(contact.publicKey)
            if (profile) {
              dhtProfileResults.set(contact.publicKey, profile)
              dlog('[App] DHT profile for ' + contact.publicKey.slice(0, 16) + ': ' + (profile.displayName || '?') + ' | status: ' + (profile.status || 'unknown') + (profile.timestamp ? ' | age: ' + Math.round((Date.now() - profile.timestamp) / 1000) + 's' : ''))
              // DIAGNOSTIC identité : l'enregistrement trouvé à la clé de ce
              // contact est signé par cette clé, donc écrit par le porteur de
              // CETTE identité. S'il ne s'auto-déclare plus la même clé, la
              // signature ne colle pas → on le loge explicitement.
              if (profile.identityPk && profile.identityPk !== contact.publicKey) {
                dlog('[App] ⚠️ DHT record key mismatch for contact ' + contact.publicKey.slice(0, 16) + ' — record claims ' + profile.identityPk.slice(0, 16) + ': entrée de contact obsolète (identité régénérée de son côté), demander une nouvelle invitation')
              }
            }
          } catch {}
        }))
        dlog('[App] Fetched ' + dhtProfileResults.size + '/' + contactsForDht.length + ' DHT profiles')
      }

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

      // ── PHASE 2.3: Check firewall status (non-blocking) ──
      // Automatically notify user if the firewall is not configured for P2P.
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
              addToast({ type: 'success', title: 'Firewall configuré', message: 'Les connexions P2P sont maintenant autorisées.' })
            } else {
              dlog('[App] Firewall UAC elevation failed or was cancelled')
              const addToast = useUIStore.getState().addToast
              addToast({ type: 'warning', title: 'Firewall non configuré', message: 'Ouvrez les Paramètres > Réseau pour configurer le firewall manuellement.' })
            }
          } else {
            dlog('[App] Firewall configured successfully (silent)')
          }
        }
      } catch (err) {
        console.warn('[App] Firewall check failed:', err)
      }

      // ── PHASE 2.5: Restore contacts from Hyperbee storage ──
      dlog('[App] ═══ PHASE 2.5: Restore contacts from Hyperbee ═══')
      try {
        const storedContacts = await window.asgard.storage.getContacts() as Array<{
          publicKey: string
          displayName: string
          status?: string
          relation?: string
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
                relation: (c.relation as 'contact' | 'favorite' | 'blocked') || 'contact',
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

      // CRITICAL: Reset contacts to 'offline' at startup, BUT use DHT profile
      // status if available and recent (within 2 minutes). This provides fast
      // presence detection: contacts who were online recently will show their
      // DHT status immediately, while P2P connection establishes in background.
      // When P2P connects, the real presence:update will override the DHT status.
      // CRITICAL: Use 2 minute threshold — contacts republish every 30s,
      // so a 2-minute window allows for 4 missed publishes before considering stale.
      // A 1-hour threshold would show contacts as 'online' even when they closed
      // the app long ago (their last DHT publish remains valid for too long).
      {
        const allContacts = useContactStore.getState().contacts
        let resetCount = 0
        let dhtStatusCount = 0
        const TWO_MINUTES = 2 * 60 * 1000 // 2 minutes — matches periodic refresh threshold
        for (const publicKey of Object.keys(allContacts)) {
          const dhtProfile = dhtProfileResults.get(publicKey)
          if (dhtProfile && dhtProfile.status && dhtProfile.timestamp &&
              (Date.now() - dhtProfile.timestamp) < TWO_MINUTES) {
            // DHT profile is recent — use its status as initial value
            const mappedStatus = fromNetworkStatus(dhtProfile.status)
            const ageSec = Math.round((Date.now() - dhtProfile.timestamp) / 1000)
            dlog('[App] DHT status for ' + publicKey.slice(0, 16) + ': ' + dhtProfile.status + ' → ' + mappedStatus + ' (age: ' + ageSec + 's, name: ' + (dhtProfile.displayName || '?') + ')')
            if (allContacts[publicKey].status !== mappedStatus) {
              useContactStore.getState().setContactStatus(publicKey, mappedStatus)
              dhtStatusCount++
            }
          } else {
            if (dhtProfile) {
              const ageSec = Math.round((Date.now() - (dhtProfile.timestamp || 0)) / 1000)
              dlog('[App] DHT profile for ' + publicKey.slice(0, 16) + ' too old (' + ageSec + 's) or no status — setting offline')
            } else {
              dlog('[App] No DHT profile for ' + publicKey.slice(0, 16) + ' — setting offline')
            }
            if (allContacts[publicKey].status !== 'offline') {
              useContactStore.getState().setContactStatus(publicKey, 'offline')
              resetCount++
            }
          }
        }
        if (resetCount > 0 || dhtStatusCount > 0) {
          dlog('[App] Reset ' + resetCount + ' contacts to offline, ' + dhtStatusCount + ' contacts set from DHT profile')
        }
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
      const allContacts = useContactStore.getState().getFilteredContacts()

      // STEP 1: joinPeer for ALL contacts using the CORRECT Noise public key.
      // Per Hyperswarm docs: "joinPeer will ensure that peer connections are
      // reestablished in the event of failures" — ideal for auto-reconnect.
      //
      // CRITICAL: The Noise public key is NOT sha256(ed25519PublicKey).
      // It is HyperDHT.keyPair(sha256(ed25519PublicKey)).publicKey — an Ed25519
      // keypair derived from the seed. Using the raw sha256 hash means joinPeer()
      // connects to a non-existent peer and peers NEVER discover each other.
      let joinPeerCount = 0
      for (const contact of allContacts) {
        try {
          const noiseKeyHex = await window.asgard.network.deriveNoisePublicKey(contact.publicKey)
          console.log('[App] joinPeer: ed25519:', contact.publicKey.slice(0, 16), '→ noise:', noiseKeyHex.slice(0, 16))
          p2pService.joinPeer(noiseKeyHex).catch((err) => {
            console.warn('[App] joinPeer failed for contact:', contact.publicKey.slice(0, 16), err)
          })
          joinPeerCount++
        } catch (err) {
          console.warn('[App] Failed to deriveNoisePublicKey for contact:', contact.publicKey.slice(0, 16), err)
        }
      }
      if (joinPeerCount > 0) {
        console.log('[App] joinPeer initiated for', joinPeerCount, 'contacts (direct connections)')
      }

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
      // Fetch contacts' DHT profiles every 1 minute as the PRIMARY presence signal.
      // CRITICAL: This is the MULTIDIRECTIONAL presence detection mechanism.
      // Each contact publishes their status to DHT every 30 seconds.
      // We fetch their status every 1 minute to detect online/offline changes.
      // This works even when P2P is broken (one-way NAT, firewall, etc.)
      dhtProfileRefreshInterval = setInterval(async () => {
        try {
          const contacts = Object.values(useContactStore.getState().contacts)
            .filter((c) => c.relation !== 'blocked')
          if (contacts.length === 0) return
          console.log('[App] DHT profile refresh: fetching', contacts.length, 'contacts')
          await Promise.allSettled(contacts.map(async (contact) => {
            try {
              const profile = await window.asgard.network.fetchProfile(contact.publicKey)
              if (profile && profile.status && profile.timestamp) {
                // CRITICAL: Use 2 minute threshold — contacts republish every 30s,
                // so a 2-minute window allows for 4 missed publishes before marking offline.
                const TWO_MINUTES = 2 * 60 * 1000
                const ageMs = Date.now() - profile.timestamp
                const ageSeconds = Math.round(ageMs / 1000)
                console.log('[App] DHT profile for', contact.publicKey.slice(0, 16) + ':', profile.displayName, '| status:', profile.status, '| age:', ageSeconds + 's')
                if (profile.identityPk && profile.identityPk !== contact.publicKey) {
                  console.warn('[App] ⚠️ DHT record key mismatch for', contact.displayName + ' (' + contact.publicKey.slice(0, 16) + ') — cet enregistrement appartient à une autre identité: la clé publique du contact a changé, il faut le ré-inviter')
                }
                
                if (ageMs < TWO_MINUTES) {
                  const mappedStatus = fromNetworkStatus(profile.status)
                  const currentContact = useContactStore.getState().getContact(contact.publicKey)
                  // PRECEDENCE: a P2P presence:update is the peer's latest word and is
                  // re-sent every 5 s while their socket is up; this DHT record is the
                  // same declaration republished every 30 s and read only every 60 s.
                  // An older copy may inform us about a peer we cannot reach, never
                  // contradict a live one — which is what used to flip a declared
                  // « absent » / « occupé » back to « hors ligne » at each refresh.
                  if (currentContact && chatService.hasFreshPresence(contact.publicKey)) {
                    console.log('[App] DHT refresh skipped for ' + contact.publicKey.slice(0, 16) + ' — presence P2P récente fait autorité')
                  } else if (currentContact && currentContact.status !== mappedStatus) {
                    useContactStore.getState().updateContact(contact.publicKey, { status: mappedStatus })
                    console.log('[App] DHT refresh: ' + contact.publicKey.slice(0, 16) + ' → ' + mappedStatus + ' (age: ' + ageSeconds + 's)')
                  }
                } else {
                  // Profile is stale — mark as offline, BUT only if the peer has not
                  // declared anything recently over P2P. A live P2P declaration proves
                  // presence even when the DHT record expired (TTL, SEQ reuse, ...).
                  const currentContact = useContactStore.getState().getContact(contact.publicKey)
                  const hasLivePresence = chatService.hasFreshPresence(contact.publicKey)
                  if (currentContact && currentContact.status !== 'offline' && !hasLivePresence) {
                    useContactStore.getState().updateContact(contact.publicKey, { status: 'offline' })
                    console.log('[App] DHT profile for', contact.publicKey.slice(0, 16), 'too old (' + ageSeconds + 's) → setting offline')
                  } else if (hasLivePresence) {
                    console.log('[App] DHT profile for', contact.publicKey.slice(0, 16), 'stale (' + ageSeconds + 's) but P2P presence is fresh — keeping declared status')
                  }
                }
              } else {
                // No profile found — mark as offline, BUT only if the peer has not
                // declared anything recently over P2P (same rule as the stale case:
                // a live declaration outranks an absent DHT record).
                const currentContact = useContactStore.getState().getContact(contact.publicKey)
                const hasLivePresence = chatService.hasFreshPresence(contact.publicKey)
                if (currentContact && currentContact.status !== 'offline' && !hasLivePresence) {
                  useContactStore.getState().updateContact(contact.publicKey, { status: 'offline' })
                  console.log('[App] DHT profile for', contact.publicKey.slice(0, 16), 'not found → setting offline')
                } else if (hasLivePresence) {
                  console.log('[App] DHT profile for', contact.publicKey.slice(0, 16), 'not found but P2P presence is fresh — keeping declared status')
                }
              }
            } catch (err) {
              console.warn('[App] DHT fetch failed for', contact.publicKey.slice(0, 16) + ':', err)
            }
          }))
        } catch (err) {
          console.warn('[App] DHT profile refresh failed:', err)
        }
      }, 60 * 1000) // Every 1 minute
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
      <SearchModal isOpen={isSearchOpen} onClose={() => setSearchOpen(false)} />
      <ModalContainer />
      <IncomingCallOverlay />
      {activeCall && <CallView />}
      <ErrorBoundary>
        <Routes>
          {/* Onboarding — no shell */}
          <Route
            path="/onboarding"
            element={isSetup ? <Navigate to="/conversations" replace /> : <OnboardingPage />}
          />

          {/* Main app — with shell */}
          <Route
            element={isSetup ? <AppShell /> : <Navigate to="/onboarding" replace />}
          >
            <Route index element={<Navigate to="/conversations" replace />} />
            <Route path="/conversations" element={<ConversationsPage />}>
              <Route path=":conversationId" element={<ChatView />} />
            </Route>
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/groups" element={<GroupsPage />}>
              <Route path=":groupId" element={<GroupsPage />} />
              <Route path=":groupId/channels/:channelId" element={<GroupsPage />} />
            </Route>
            <Route path="/calls" element={<CallsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
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
