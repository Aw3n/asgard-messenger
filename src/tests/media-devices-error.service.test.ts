/**
 * Une énumération de périphériques qui échoue rend une liste vide : sans état
 * retenu, les réglages affichaient « aucun micro, aucune caméra » comme si la
 * machine n'en avait pas. Le service garde donc la panne, et l'efface dès que
 * la lecture suivante réussit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mediaDeviceService } from '@/services/MediaDeviceService'

const enumerateDevices = vi.fn()
const getUserMedia = vi.fn()
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value })
}

beforeEach(() => {
  enumerateDevices.mockReset()
  getUserMedia.mockReset()
  setMediaDevices({ enumerateDevices, getUserMedia })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else Reflect.deleteProperty(navigator, 'mediaDevices')
  vi.restoreAllMocks()
})

describe('état de la lecture des périphériques', () => {
  it('retient la panne d’énumération et l’efface au succès', async () => {
    enumerateDevices.mockRejectedValueOnce(new Error('matériel indisponible'))

    expect(await mediaDeviceService.refreshDevices()).toEqual([])
    expect(mediaDeviceService.getDevicesError()).toBe('Failed to enumerate devices')

    enumerateDevices.mockResolvedValueOnce([
      { deviceId: 'mic-1', label: 'Micro du casque', kind: 'audioinput', groupId: 'g1' },
    ])

    const devices = await mediaDeviceService.refreshDevices()

    expect(devices).toHaveLength(1)
    expect(mediaDeviceService.getDevicesError()).toBeNull()
  })

  it('un refus de permission n’est pas une panne de lecture', async () => {
    enumerateDevices.mockRejectedValueOnce(new Error('matériel indisponible'))
    await mediaDeviceService.refreshDevices()
    expect(mediaDeviceService.getDevicesError()).not.toBeNull()

    getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'))

    expect(await mediaDeviceService.requestPermission('audio')).toBe(false)
    expect(mediaDeviceService.getDevicesError()).toBeNull()
  })
})
