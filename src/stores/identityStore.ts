import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LocalIdentity, UserProfile, UserStatus } from '@/types'
import { bytesToHexSafe } from '@/utils/bytes'

interface IdentityState {
  identity: LocalIdentity | null
  isLoading: boolean
  isSetup: boolean

  // Actions
  createIdentity: () => Promise<void>
  loadIdentity: () => Promise<void>
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>
  setStatus: (status: UserStatus) => Promise<void>
  reset: () => void
}

/**
 * Identity store — manages the local cryptographic identity and user profile.
 * Interfaces with the Electron main process via the asgard API.
 */
export const useIdentityStore = create<IdentityState>()(
  persist(
    (set, get) => ({
      identity: null,
      isLoading: false,
      isSetup: false,

      createIdentity: async () => {
        set({ isLoading: true })
        try {
          const result = await window.asgard.identity.create()
          const now = Date.now()
          // CRITICAL: Use bytesToHexSafe to handle structured-clone artifacts from IPC.
          // IPC serializes Uint8Array as plain objects {0: byte, 1: byte, ...}.
          // Array.from() on such objects returns [], breaking all crypto operations.
          const publicKeyHex = bytesToHexSafe(result.publicKey)
          const secretKeyHex = bytesToHexSafe(result.keyPair.secretKey)
          const profile: UserProfile = {
            publicKey: publicKeyHex,
            displayName: `User-${publicKeyHex.slice(0, 8)}`,
            status: 'online',
            createdAt: now,
            updatedAt: now,
          }
          const identity: LocalIdentity = {
            keyPair: {
              publicKey: publicKeyHex,
              secretKey: secretKeyHex,
            },
            profile,
          }
          set({ identity, isSetup: true, isLoading: false })
        } catch (err) {
          console.error('[IdentityStore] Failed to create identity:', err)
          set({ isLoading: false })
          throw err
        }
      },

      loadIdentity: async () => {
        set({ isLoading: true })
        try {
          const exists = await window.asgard.identity.exists()
          if (!exists) {
            // CRITICAL: Reset state AND clear localStorage if identity file doesn't exist.
            // This handles the case where the identity file was deleted
            // (e.g. corruption) but localStorage still has stale state.
            localStorage.removeItem('asgard-identity')
            set({ isLoading: false, isSetup: false, identity: null })
            return
          }
          const result = await window.asgard.identity.load()
          if (result) {
            // CRITICAL: Use bytesToHexSafe for IPC structured-clone safety.
            const publicKeyHex = bytesToHexSafe(result.publicKey)
            const secretKeyHex = bytesToHexSafe(result.keyPair.secretKey)
            // Merge with persisted profile
            const current = get().identity
            const profile: UserProfile = current?.profile ?? {
              publicKey: publicKeyHex,
              displayName: `User-${publicKeyHex.slice(0, 8)}`,
              status: 'online',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
            const identity: LocalIdentity = {
              keyPair: {
                publicKey: publicKeyHex,
                secretKey: secretKeyHex,
              },
              profile: { ...profile, publicKey: publicKeyHex },
            }
            set({ identity, isSetup: true, isLoading: false })
          } else {
            set({ isLoading: false })
          }
        } catch (err) {
          console.error('[IdentityStore] Failed to load identity:', err)
          set({ isLoading: false })
        }
      },

      updateProfile: async (updates) => {
        const { identity } = get()
        if (!identity) return

        const updatedProfile: UserProfile = {
          ...identity.profile,
          ...updates,
          updatedAt: Date.now(),
        }
        const updatedIdentity: LocalIdentity = {
          ...identity,
          profile: updatedProfile,
        }

        set({ identity: updatedIdentity })

        // Persist to electron
        try {
          await window.asgard.identity.save({
            publicKey: identity.keyPair.publicKey,
            secretKey: identity.keyPair.secretKey,
            profile: {
              displayName: updatedProfile.displayName,
              status: updatedProfile.status,
              avatar: updatedProfile.avatar,
              about: updatedProfile.about,
              customStatus: updatedProfile.customStatus,
            },
          })
        } catch (err) {
          console.error('[IdentityStore] Failed to save profile:', err)
        }

        // Publish profile to DHT for contact discovery
        if (window.asgard?.network?.publishProfile) {
          try {
            await window.asgard.network.publishProfile(
              updatedProfile.displayName,
              updatedProfile.avatar
            )
            console.log('[IdentityStore] Profile published to DHT')
          } catch (err) {
            console.error('[IdentityStore] Failed to publish profile to DHT:', err)
          }
        }

        // CRITICAL FIX: Publish status to DHT and peers when status changes
        // Map 'busy'/'invisible' to supported network statuses
        if (updates.status !== undefined && window.asgard?.network?.publishStatus) {
          try {
            const networkStatus: 'online' | 'away' | 'offline' | 'dnd' =
              updatedProfile.status === 'busy' ? 'dnd' :
              updatedProfile.status === 'invisible' ? 'offline' :
              updatedProfile.status === 'dnd' ? 'dnd' :
              updatedProfile.status === 'away' ? 'away' :
              updatedProfile.status === 'offline' ? 'offline' :
              'online'
            await window.asgard.network.publishStatus(
              networkStatus,
              updatedProfile.customStatus
            )
            console.log('[IdentityStore] Status published to network:', networkStatus)
          } catch (err) {
            console.error('[IdentityStore] Failed to publish status:', err)
          }
        }
      },

      setStatus: async (status) => {
        // Update Zustand state immediately for instant UI feedback
        const { identity } = get()
        if (!identity) return
        const updatedProfile: UserProfile = {
          ...identity.profile,
          status,
          updatedAt: Date.now(),
        }
        set({ identity: { ...identity, profile: updatedProfile } })

        // Persist + broadcast in background
        get().updateProfile({ status }).catch(console.error)
      },

      reset: () => {
        set({ identity: null, isSetup: false, isLoading: false })
      },
    }),
    {
      name: 'asgard-identity',
      storage: createJSONStorage(() => localStorage),
      // Only persist the profile, not the secret key (stored by electron)
      partialize: (state) => ({
        isSetup: state.isSetup,
        identity: state.identity
          ? {
              keyPair: { publicKey: state.identity.keyPair.publicKey, secretKey: '' },
              profile: state.identity.profile,
            }
          : null,
      }),
      // CRITICAL: Normalize rehydrated data to handle legacy localStorage entries.
      // Old versions stored Uint8Array objects that get serialized as plain objects
      // {0: 48, 1: 48, ...} by JSON.stringify. This merge function converts them
      // back to proper hex strings on every app load.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<IdentityState> | undefined
        if (persisted?.identity) {
          const pk = bytesToHexSafe(persisted.identity.keyPair?.publicKey)
          const sk = bytesToHexSafe(persisted.identity.keyPair?.secretKey)
          persisted.identity = {
            ...persisted.identity,
            keyPair: { publicKey: pk, secretKey: sk },
            profile: {
              ...persisted.identity.profile,
              publicKey: pk,
            },
          }
        }
        return { ...currentState, ...persisted }
      },
    }
  )
)
