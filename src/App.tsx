import React, { useEffect, useCallback, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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
  const initDone = useRef(false)
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

  useEffect(() => {
    const dlog = (m: string) => { console.log(m); try { window.asgard.debugLog(m) } catch {} }
    dlog('[App] Init useEffect: isSetup=' + isSetup + ' hasIdentity=' + !!identity + ' identityVerified=' + identityVerified + ' initDone=' + initDone.current)
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
    // CRITICAL: Prevent double initialization (React StrictMode)
    if (initDone.current) {
      dlog('[App] Init blocked: initDone=true')
      return
    }
    initDone.current = true

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
      const status = identity.profile.status || 'online'
      const statusMessage = identity.profile.customStatus || identity.profile.about
      const networkStatus: 'online' | 'away' | 'offline' | 'dnd' =
        status === 'busy' ? 'dnd' :
        status === 'invisible' ? 'offline' :
        status === 'dnd' ? 'dnd' :
        status === 'away' ? 'away' :
        status === 'offline' ? 'offline' :
        'online'
      dlog('[App] Publishing profile + status to DHT (parallel): ' + identity.profile.displayName)
      await Promise.allSettled([
        window.asgard.network.publishProfile(identity.profile.displayName),
        window.asgard.network.publishStatus(networkStatus, statusMessage),
      ])
      dlog('[App] Profile + status published to DHT: ' + networkStatus)

      // Now initialize all services (peers may connect from here on)
      dlog('[App] Initializing services...')
      await p2pService.initialize()
      chatService.initialize()
      groupService.initialize()
      callService.initialize()
      fileService.initialize()
      // Initialize media device detection (non-blocking, no await needed)
      mediaDeviceService.initialize().catch(() => {})
      // Start activity monitor for auto-away detection
      activityMonitor.start()
      dlog('[App] Services initialized')

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

      // CRITICAL: Reset ALL contacts to 'offline' at startup.
      // The contactStore uses zustand/persist (localStorage), so contacts are
      // restored with their last-known status before this code runs. We must
      // force every contact to 'offline' — the real status will be set by
      // presence:update or peer:identified events when peers actually connect.
      // Without this, contacts appear online even if the remote app is closed.
      {
        const allContacts = useContactStore.getState().contacts
        let resetCount = 0
        for (const publicKey of Object.keys(allContacts)) {
          if (allContacts[publicKey].status !== 'offline') {
            useContactStore.getState().setContactStatus(publicKey, 'offline')
            resetCount++
          }
        }
        if (resetCount > 0) {
          dlog('[App] Reset ' + resetCount + ' contacts to offline (will update via presence events)')
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
          p2pService.joinPeer(noiseKeyHex).catch(() => {})
          joinPeerCount++
        } catch (err) {
          console.warn('[App] Failed to joinPeer for contact:', contact.publicKey.slice(0, 16), err)
        }
      }
      if (joinPeerCount > 0) {
        console.log('[App] joinPeer established for', joinPeerCount, 'contacts (direct connections)')
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

      // ── PHASE 4: Delayed re-identify + presence broadcast ──
      // Reduced from 5s to 2s: with joinPeer + parallel topic joins, peers
      // connect faster. This second pass catches peers that connected after
      // the initial reidentifyAll().
      setTimeout(async () => {
        try {
          await window.asgard.network.reidentifyAll()
          chatService.broadcastPresence().catch(console.error)
          console.log('[App] Delayed re-identify + presence broadcast complete')
        } catch (err) {
          console.warn('[App] Delayed re-identify failed:', err)
        }
      }, 2000)
    }

    init().catch(console.error)

    return () => {
      activityMonitor.stop()
      p2pService.destroy()
      chatService.destroy()
    }
  }, [isSetup, identity, identityVerified])

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
    <>
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
    </>
  )
}

export default App
