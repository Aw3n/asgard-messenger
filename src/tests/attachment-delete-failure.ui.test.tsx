/**
 * Pièce jointe : supprimer un fichier pouvait échouer sans un mot.
 *
 * `handleDelete` n'exploitait que le booléen de `deleteFileAttachment` pour
 * fermer la demande : un `false` ou un rejet laissait la confirmation ouverte
 * devant un fichier toujours présent, sans explication. Ce test exige un toast
 * d'erreur dans les deux cas, et vérifie qu'une suppression réussie reste
 * silencieuse et referme la demande.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageAttachment } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

const CONVERSATION_ID = 'conv-1'
const realDeleteFileAttachment = useMessageStore.getState().deleteFileAttachment

const documentAttachment = (): MessageAttachment => ({
  id: 'att-1',
  type: 'document',
  name: 'report.pdf',
  size: 2048,
  mimeType: 'application/pdf',
  blobKey: 'blob-1',
})

const toasts = () => useUIStore.getState().toasts

const confirmDelete = () => {
  render(
    <FileAttachment
      attachment={documentAttachment()}
      isOwn
      messageId="m1"
      conversationId={CONVERSATION_ID}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'chat.deleteFile' }))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'chat.deleteFileConfirm' }))
      .getByRole('button', { name: 'common.delete' }),
  )
}

beforeEach(() => {
  window.scrollTo = () => {}
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  useUIStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useMessageStore.setState({ deleteFileAttachment: realDeleteFileAttachment })
})

describe('supprimer une pièce jointe', () => {
  it('un refus du store se dit et laisse la demande ouverte', async () => {
    useMessageStore.setState({ deleteFileAttachment: vi.fn(async () => false) })
    confirmDelete()

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'chat.deleteFileFailed')
      expect(toast?.type).toBe('error')
    })
    expect(screen.getByRole('dialog', { name: 'chat.deleteFileConfirm' })).toBeInTheDocument()
  })

  it('un rejet du store se dit aussi', async () => {
    useMessageStore.setState({
      deleteFileAttachment: vi.fn(async () => { throw new Error('blob verrouillé') }),
    })
    confirmDelete()

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'chat.deleteFileFailed')
      expect(toast?.type).toBe('error')
    })
  })

  it('une suppression acceptée referme la demande sans rien signaler', async () => {
    useMessageStore.setState({ deleteFileAttachment: vi.fn(async () => true) })
    confirmDelete()

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'chat.deleteFileConfirm' })).toBeNull(),
    )
    expect(toasts().some((entry) => entry.title === 'chat.deleteFileFailed')).toBe(false)
  })
})
