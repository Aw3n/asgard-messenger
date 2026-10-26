/**
 * Le choix d'une photo d'avatar ne doit pas être un clic muet : un fichier
 * au-delà de 10 Mo était ignoré sans un mot, et une lecture impossible aussi.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { Avatar } from '@/components/ui/Avatar'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

/** jsdom ne charge aucune image : le décodeur échoue, donc la compression aussi. */
class FailingImage {
  onload: null | (() => void) = null
  onerror: null | (() => void) = null
  width = 0
  height = 0
  set src(_url: string) {
    setTimeout(() => this.onerror?.(), 0)
  }
}

let createdInput: HTMLInputElement | null = null

beforeEach(() => {
  // `unstubAllGlobals` d'après-test retire aussi ce stub : il se repose à chaque cas.
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  createdInput = null
  const originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    const element = originalCreateElement(tag, options)
    if (tag === 'input') createdInput = element as HTMLInputElement
    return element
  }) as typeof document.createElement)
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Ouvre le sélecteur d'Avatar, y dépose le fichier et laisse le handler courir. */
async function chooseFile(
  file: File,
  handlers: { onUpload: (dataUrl: string) => void; onUploadError: (reason: 'tooLarge' | 'readFailed') => void },
) {
  render(
    <Avatar
      name="Moi"
      publicKey={'a'.repeat(64)}
      editable
      onUpload={handlers.onUpload}
      onUploadError={handlers.onUploadError}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'avatar.uploadPhoto' }))
  const input = createdInput
  if (!input) throw new Error('file input not created')
  Object.defineProperty(input, 'files', { value: [file] })
  await act(async () => {
    input.dispatchEvent(new Event('change'))
  })
}

describe('Avatar — photo choisie', () => {
  it('nomme un fichier trop lourd au lieu de l’ignorer', async () => {
    const onUpload = vi.fn()
    const onUploadError = vi.fn()
    const file = new File([new Uint8Array(4)], 'enorme.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })

    await chooseFile(file, { onUpload, onUploadError })

    expect(onUploadError).toHaveBeenCalledWith('tooLarge')
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('lit la photo brute quand la compression échoue', async () => {
    vi.stubGlobal('Image', FailingImage)
    const onUpload = vi.fn()
    const onUploadError = vi.fn()
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })

    await chooseFile(file, { onUpload, onUploadError })

    await waitFor(() => expect(onUpload).toHaveBeenCalled())
    expect(onUploadError).not.toHaveBeenCalled()
  })

  it('dit qu’une image illisible ne peut pas être chargée', async () => {
    vi.stubGlobal('Image', FailingImage)
    // La lecture de la compression aboutit ; la relecture brute, elle, échoue.
    let reads = 0
    class SecondReadFails {
      onload: null | ((event: { target: { result: string } }) => void) = null
      onerror: null | (() => void) = null
      result: string | null = null
      readAsDataURL() {
        reads += 1
        if (reads === 1) {
          setTimeout(() => this.onload?.({ target: { result: 'data:image/png;base64,AAAA' } }), 0)
        } else {
          setTimeout(() => this.onerror?.(), 0)
        }
      }
    }
    vi.stubGlobal('FileReader', SecondReadFails)

    const onUpload = vi.fn()
    const onUploadError = vi.fn()
    const file = new File([new Uint8Array([1, 2, 3])], 'casse.png', { type: 'image/png' })

    await chooseFile(file, { onUpload, onUploadError })

    await waitFor(() => expect(onUploadError).toHaveBeenCalledWith('readFailed'))
    expect(onUpload).not.toHaveBeenCalled()
  })
})
