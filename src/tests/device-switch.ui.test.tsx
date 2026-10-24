/**
 * Périphériques : les tests suivent réellement le choix d'appareil.
 *
 * L'aperçu caméra était conditionné par une ref : aucun rendu ne le montrait,
 * donc « Tester la caméra » semblait mort malgré une capture bien lancée.
 * Choisir un micro lançait par ailleurs une capture sans test en cours, et
 * changer de caméra pendant l'aperçu laissait l'ancien flux à l'écran. Ces
 * tests tiennent les trois comportements.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const testMicrophone = vi.fn()
const testCamera = vi.fn()

vi.mock('@/services/MediaDeviceService', () => ({
  mediaDeviceService: {
    getPreferences: () => ({ audioInput: 'mic-1', videoInput: 'cam-1', audioOutput: 'spk-1' }),
    getMicrophones: () => [
      { deviceId: 'mic-1', label: 'Micro du casque', kind: 'audioinput' },
      { deviceId: 'mic-2', label: 'Micro du bureau', kind: 'audioinput' },
    ],
    getCameras: () => [
      { deviceId: 'cam-1', label: 'Webcam intégrée', kind: 'videoinput' },
      { deviceId: 'cam-2', label: 'Webcam USB', kind: 'videoinput' },
    ],
    getSpeakers: () => [{ deviceId: 'spk-1', label: 'Haut-parleurs', kind: 'audiooutput' }],
    hasPermission: () => true,
    on: () => {},
    off: () => {},
    requestPermission: vi.fn().mockResolvedValue(true),
    setPreferredDevice: vi.fn(),
    testMicrophone: (...args: unknown[]) => testMicrophone(...args),
    testCamera: (...args: unknown[]) => testCamera(...args),
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
}

const micSelect = () => screen.getByRole('combobox', { name: 'settings.microphone' })
const camSelect = () => screen.getByRole('combobox', { name: 'settings.camera' })
const video = () => document.querySelector('video') as HTMLVideoElement

beforeEach(() => {
  testMicrophone.mockResolvedValue(() => {})
  testCamera.mockResolvedValue({ stream: {}, stop: () => {} })
  useUIStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useUIStore.setState({ toasts: [] })
})

describe('aperçu caméra', () => {
  it('s’affiche dès que le test réussit', async () => {
    const stream = {}
    testCamera.mockResolvedValueOnce({ stream, stop: () => {} })
    await openDevices()

    fireEvent.click(screen.getByRole('button', { name: 'settings.testCamera' }))

    expect(await screen.findByRole('button', { name: 'settings.stopPreview' })).toBeInTheDocument()
    expect(video().style.display).toBe('block')
    expect(video().srcObject).toBe(stream)
  })

  it('se referme au clic sur Arrêter', async () => {
    const stop = vi.fn()
    testCamera.mockResolvedValueOnce({ stream: {}, stop })
    await openDevices()

    fireEvent.click(screen.getByRole('button', { name: 'settings.testCamera' }))
    fireEvent.click(await screen.findByRole('button', { name: 'settings.stopPreview' }))

    expect(stop).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'settings.testCamera' })).toBeInTheDocument()
    expect(video().style.display).toBe('none')
  })
})

describe('choisir un appareil', () => {
  it('n’allume pas le micro quand aucune mesure ne tourne', async () => {
    await openDevices()

    fireEvent.change(micSelect(), { target: { value: 'mic-2' } })

    expect(testMicrophone).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(toasts().some((entry) => entry.title === 'toast.microphoneUpdated')).toBe(true)
    })
  })

  it('reprend la mesure en cours sur le nouveau micro', async () => {
    const stopFirst = vi.fn()
    testMicrophone.mockResolvedValueOnce(stopFirst).mockResolvedValueOnce(() => {})
    await openDevices()

    fireEvent.click(screen.getByRole('button', { name: 'settings.testMic' }))
    await screen.findByRole('button', { name: 'settings.stopTest' })

    fireEvent.change(micSelect(), { target: { value: 'mic-2' } })

    await waitFor(() => expect(testMicrophone).toHaveBeenCalledTimes(2))
    expect(testMicrophone).toHaveBeenLastCalledWith('mic-2', expect.any(Function))
    expect(stopFirst).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'settings.stopTest' })).toBeInTheDocument()
  })

  it('rebranche l’aperçu ouvert sur la nouvelle caméra', async () => {
    const stopFirst = vi.fn()
    testCamera.mockResolvedValueOnce({ stream: {}, stop: stopFirst }).mockResolvedValueOnce({ stream: {}, stop: () => {} })
    await openDevices()

    fireEvent.click(screen.getByRole('button', { name: 'settings.testCamera' }))
    await screen.findByRole('button', { name: 'settings.stopPreview' })

    fireEvent.change(camSelect(), { target: { value: 'cam-2' } })

    await waitFor(() => expect(testCamera).toHaveBeenCalledTimes(2))
    expect(testCamera).toHaveBeenLastCalledWith('cam-2')
    expect(stopFirst).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'settings.stopPreview' })).toBeInTheDocument()
  })

  it('dit l’échec d’un aperçu impossible sur la nouvelle caméra', async () => {
    testCamera
      .mockResolvedValueOnce({ stream: {}, stop: () => {} })
      .mockRejectedValueOnce(new Error('caméra occupée'))
    await openDevices()

    fireEvent.click(screen.getByRole('button', { name: 'settings.testCamera' }))
    await screen.findByRole('button', { name: 'settings.stopPreview' })

    fireEvent.change(camSelect(), { target: { value: 'cam-2' } })

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'toast.cameraTestFailed')
      expect(toast?.type).toBe('error')
    })
    expect(screen.getByRole('button', { name: 'settings.testCamera' })).toBeInTheDocument()
    expect(video().style.display).toBe('none')
  })
})
