/**
 * ImageLightbox regressions.
 *
 * The viewer used to be unusable in practice: a click on the picture closed it,
 * the wheel handler was registered as a passive listener (so preventDefault did
 * nothing and the chat behind kept scrolling), and it could only ever show the
 * small preview that came with the message.
 *
 * A fourth regression is covered here: `localUrl` survives in the persisted
 * message but its `blob:` dies with the session, so the viewer displayed the
 * browser's broken-image glyph behind a confident "100 %" badge. It must fall
 * back on the original, and say so out loud when nothing can render.
 *
 * A fifth one: the stage and the pan bounds were measured on the whole viewport
 * while the tool bars are painted over it, so the top and bottom bands of a
 * zoomed picture could never be dragged out from behind the controls — the
 * viewer looked like it was cropping the image.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import i18n from '@/i18n/config'
import { ImageLightbox, type LightboxItem } from '@/features/chat/components/ImageLightbox'

const THUMB = 'data:image/png;base64,thumb'
const FULL = 'data:image/png;base64,full'
/** An object URL persisted with the message: syntactically valid, renders nothing. */
const DEAD = 'blob:https://app/previous-session'

const item = (over: Partial<LightboxItem> = {}): LightboxItem => ({
  id: 'att-1',
  src: THUMB,
  alt: 'photo.png',
  ...over,
})

const stageOf = () => {
  const img = screen.getByAltText('photo.png')
  return img.parentElement as HTMLElement
}

const imgOf = () => screen.getByAltText('photo.png') as HTMLImageElement

/** Labels come from i18n, so the assertions follow whatever locale the suite runs in. */
const label = (key: string) => String(i18n.t(key))
const retryButton = () => screen.queryByRole('button', { name: label('lightbox.retry') })

describe('ImageLightbox', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  it('keeps the viewer open when the picture itself is clicked', () => {
    const onClose = vi.fn()
    render(<ImageLightbox items={[item()]} onClose={onClose} />)

    fireEvent.click(imgOf())
    expect(onClose).not.toHaveBeenCalled()

    // Clicking outside the picture still closes it.
    fireEvent.click(stageOf())
    expect(onClose).toHaveBeenCalled()
  })

  it('zooms with the wheel and keeps the image transform under our control', () => {
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    const img = imgOf()
    expect(img.style.transform).toContain('scale(1)')

    act(() => {
      fireEvent.wheel(stageOf(), { deltaY: -120, clientX: 10, clientY: 10 })
    })
    expect(img.style.transform).toMatch(/scale\(1\.[1-9]/)
  })

  /**
   * Réglage « ajusté » et bornes du pan doivent être mesurés sur la zone libre,
   * pas sur tout le viewport : les bandeaux sont en surimpression, et une bande
   * de 46 px en haut comme en bas restait inaccessible à chaque zoom — une image
   * « rognée » qu'aucun glisser ne pouvait dégager.
   */
  it('reserves the control bars so every edge of the picture is reachable', () => {
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    const stage = screen.getByTestId('lightbox-stage') as HTMLElement
    // Les bandeaux étant mesurés (leur hauteur suit la taille de police), on
    // verrouille l'ordre de grandeur plutôt que des pixels exacts.
    expect(parseFloat(stage.style.top)).toBeGreaterThanOrEqual(40)
    expect(parseFloat(stage.style.bottom)).toBeGreaterThanOrEqual(40)
    // Pas de galerie → pas de flèches latérales → toute la largeur est prise.
    expect(stage.style.left).toBe('0px')
    expect(stage.style.right).toBe('0px')
    // L'image s'ajuste à la scène, plus à des valeurs fixes de viewport.
    expect(imgOf().className).toContain('max-h-full')
    expect(imgOf().className).toContain('max-w-full')

    // Clic sur la photo : les contrôles s'effacent, la scène reprend la place.
    fireEvent.click(imgOf())
    expect(stage.style.top).toBe('0px')
    expect(stage.style.bottom).toBe('0px')
  })

  it('keeps room for the gallery arrows so they never sit on the picture', () => {
    render(<ImageLightbox items={[item({ id: 'a' }), item({ id: 'b' })]} onClose={vi.fn()} />)
    const stage = screen.getByTestId('lightbox-stage') as HTMLElement
    expect(parseFloat(stage.style.left)).toBeGreaterThanOrEqual(40)
    expect(stage.style.left).toBe(stage.style.right)
  })

  it('fetches the original resolution when only a preview is on screen', async () => {
    const loadFull = vi.fn().mockResolvedValue(FULL)
    render(<ImageLightbox items={[item({ preview: true, loadFull })]} onClose={vi.fn()} />)

    await waitFor(() => expect(loadFull).toHaveBeenCalled())
    await waitFor(() => expect(imgOf().getAttribute('src')).toBe(FULL))
  })

  it('does not re-download a picture that is already local', () => {
    const loadFull = vi.fn().mockResolvedValue(FULL)
    render(<ImageLightbox items={[item({ src: FULL, preview: false, loadFull })]} onClose={vi.fn()} />)
    expect(loadFull).not.toHaveBeenCalled()
  })

  it('recovers a dead source by re-fetching the original instead of showing a broken picture', async () => {
    const loadFull = vi.fn().mockResolvedValue(FULL)
    render(<ImageLightbox items={[item({ src: DEAD, preview: false, loadFull })]} onClose={vi.fn()} />)

    fireEvent.error(imgOf())

    await waitFor(() => expect(loadFull).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(imgOf().getAttribute('src')).toBe(FULL))
    expect(retryButton()).toBeNull()
  })

  it('admits the picture cannot be rendered, and offers a real retry', async () => {
    const loadFull = vi.fn().mockResolvedValue(null)
    render(<ImageLightbox items={[item({ src: DEAD, preview: false, loadFull })]} onClose={vi.fn()} />)

    fireEvent.error(imgOf())

    await waitFor(() => expect(retryButton()).not.toBeNull())
    // No broken-image glyph left on screen, and the reason is spelled out.
    expect(screen.queryByAltText('photo.png')).toBeNull()
    expect(screen.getByText(label('lightbox.imageUnavailable'))).toBeInTheDocument()

    fireEvent.click(retryButton() as HTMLElement)
    await waitFor(() => expect(imgOf()).toBeInTheDocument())

    // The retry is not cosmetic: it goes back to the source and asks again.
    fireEvent.error(imgOf())
    await waitFor(() => expect(loadFull).toHaveBeenCalledTimes(2))
  })

  it('never loops when the recovery hands back the very same failing URL', async () => {
    const loadFull = vi.fn().mockResolvedValue(DEAD)
    render(<ImageLightbox items={[item({ src: DEAD, preview: false, loadFull })]} onClose={vi.fn()} />)

    fireEvent.error(imgOf())

    await waitFor(() => expect(retryButton()).not.toBeNull())
    expect(loadFull).toHaveBeenCalledTimes(1)
    expect(screen.queryByAltText('photo.png')).toBeNull()
  })

  it('walks through the conversation photos and shows the position', async () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]
    render(<ImageLightbox items={items} startIndex={1} onClose={vi.fn()} />)
    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByText('3 / 3')).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByText('1 / 3')).toBeInTheDocument())
  })

  it('closes on Escape and releases the page scroll lock on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(<ImageLightbox items={[item()]} onClose={onClose} />)
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()

    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
