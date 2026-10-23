/**
 * Reprise de pagination après une clé exacte.
 *
 * La page de contexte d'un saut profond se termine sur un message précis.
 * Reprendre « après son horodatage » sauterait les messages qui partagent la
 * même milliseconde : la borne basse doit inclure l'identifiant.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => 'asgard-test-data' },
}))

import { StorageService } from '../../electron/services/StorageService'

type StreamOptions = Record<string, unknown>

function serviceWithStream() {
  const createReadStream = vi.fn((_options: StreamOptions) => (async function* () {})())
  const service = new StorageService()
  const withBee = service as unknown as {
    getMessagesBee: (conversationId: string) => Promise<{
      createReadStream: typeof createReadStream
    }>
  }
  withBee.getMessagesBee = async () => ({ createReadStream })
  return { service, createReadStream }
}

describe('pagination après une clé', () => {
  let service: StorageService
  let createReadStream: ReturnType<typeof serviceWithStream>['createReadStream']

  beforeEach(() => {
    const created = serviceWithStream()
    service = created.service
    createReadStream = created.createReadStream
  })

  it('reprend après l’identifiant, pas seulement après la milliseconde', async () => {
    await service.getMessages('conv', { after: 1_000, afterId: 'msg-b', limit: 50 })

    expect(createReadStream).toHaveBeenCalledWith({ gt: '1000:msg-b' })
  })

  it('sans identifiant, saute toute la milliseconde', async () => {
    await service.getMessages('conv', { after: 1_000, limit: 50 })

    expect(createReadStream).toHaveBeenCalledWith({ gt: '1000:\uffff' })
  })

  it('combine la borne haute et la reprise basse', async () => {
    await service.getMessages('conv', { after: 1_000, afterId: 'msg-b', before: 2_000 })

    expect(createReadStream).toHaveBeenCalledWith({ gt: '1000:msg-b', lt: '2000:' })
  })
})
