/**
 * Périphériques : un test micro raté ne reste plus muet.
 *
 * Le bouton « Tester le micro » avalait le rejet de `testMicrophone` : rien ne
 * bougeait à l'écran, comme si le bouton était mort, alors que le test caméra
 * annonçait déjà le sien. Le micro doit dire son échec, et le test suivant doit
 * pouvoir être relancé.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const testMicrophone = vi.fn()

vi.mock('@/services/MediaDeviceService', () => ({
  mediaDeviceService: {
    getPreferences: () => ({ audioInput: 'mic-1', videoInput: 'cam-1', audioOutput: 'spk-1' }),
    getDevicesError: () => null,
    getMicrophones: () => [{ deviceId: 'mic-1', label: 'Micro du casque', kind: 'audioinput' }],
    getCameras: () => [{ deviceId: 'cam-1', label: 'Webcam intégrée', kind: 'videoinput' }],
    getSpeakers: () => [{ deviceId: 'spk-1', label: 'Haut-parleurs', kind: 'audiooutput' }],
    hasPermission: () => true,
    on: () => {},
    off: () => {},
    requestPermission: vi.fn().mockResolvedValue(true),
    setPreferredDevice: () => {},
    testMicrophone: (...args: unknown[]) => testMicrophone(...args),
    testCamera: vi.fn().mockResolvedValue({ stream: {}, stop: () => {} }),
  },
}))

import { SettingsPage } from '@/features/settings/SettingsPage'
import { useUIStore } from '@/stores/uiStore'

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

const toasts = () => useUIStore.getState().toasts

async function openDevices() {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'settings.devices' }))
  await screen.findByRole('heading', { level: 3, name: 'settings.devices' })
  return screen.getByRole('button', { name: 'settings.testMic' })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useUIStore.setState({ toasts: [] })
})

describe('test du microphone', () => {
  it('annonce l’échec au lieu de laisser le bouton sans effet', async () => {
    testMicrophone.mockRejectedValueOnce(new Error('périphérique occupé'))
    useUIStore.setState({ toasts: [] })
    const button = await openDevices()

    fireEvent.click(button)

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.microphoneTestFailed')
      expect(toast?.type).toBe('error')
    })
  })

  it('laisse relancer le test après un échec', async () => {
    testMicrophone.mockRejectedValueOnce(new Error('périphérique occupé')).mockResolvedValueOnce(() => {})
    useUIStore.setState({ toasts: [] })
    const button = await openDevices()

    fireEvent.click(button)
    await waitFor(() => expect(testMicrophone).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'settings.testMic' }))
    await waitFor(() => expect(testMicrophone).toHaveBeenCalledTimes(2))

    // Le second essai a réussi : l'erreur du premier ne doit pas se rejouer.
    expect(toasts().filter((entry) => entry.title === 'settings.microphoneTestFailed')).toHaveLength(1)
  })
})
