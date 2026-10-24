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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import i18n from '@/i18n/config'
import { useUIStore } from '@/stores/uiStore'
import { formatCombo } from '@/utils/shortcuts'
import { ImageLightbox, type LightboxItem } from '@/features/chat/components/ImageLightbox'

/**
 * jsdom n'expose pas toujours PointerEvent : un substitut minimal dérivé de
 * MouseEvent suffit au balayage (clientX/clientY/button), le pointerId absent
 * étant comparé à lui-même.
 */
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {}
  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent
}

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

/** Conteneur plein écran : c'est lui qui porte les gestes (balayage, fond). */
const containerOf = () => stageOf().parentElement as HTMLElement

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

  it('navigue directement par la bande de vignettes, absente pour une photo isolée', async () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]
    const { unmount } = render(<ImageLightbox items={items} onClose={vi.fn()} />)
    const strip = screen.getByTestId('lightbox-filmstrip')
    const thumbs = within(strip).getAllByRole('button')
    expect(thumbs).toHaveLength(3)

    fireEvent.click(thumbs[2])
    await waitFor(() => expect(screen.getByText('3 / 3')).toBeInTheDocument())

    unmount()
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    expect(screen.queryByTestId('lightbox-filmstrip')).toBeNull()
  })

  it('change de photo par balayage horizontal, sans fermer la visionneuse au relâchement', async () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]
    const onClose = vi.fn()
    render(<ImageLightbox items={items} startIndex={1} onClose={onClose} />)
    const container = containerOf()

    fireEvent.pointerDown(container, { button: 0, pointerId: 1, clientX: 300, clientY: 200 })
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 100, clientY: 205 })
    fireEvent.pointerUp(container, { pointerId: 1, clientX: 100, clientY: 205 })
    await waitFor(() => expect(screen.getByText('3 / 3')).toBeInTheDocument())

    // Le clic de relâchement du balayage ne doit pas être relu comme un clic de fond.
    fireEvent.click(container)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('change de photo avec une molette horizontale quand la photo n’est pas zoomée', async () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]
    render(<ImageLightbox items={items} onClose={vi.fn()} />)

    act(() => {
      fireEvent.wheel(stageOf(), { deltaX: 120, deltaY: 0 })
    })
    await waitFor(() => expect(screen.getByText('2 / 3')).toBeInTheDocument())
  })

  it('gèle la navigation pendant un zoom : la bande disparaît, les flèches s’effacent', () => {
    render(<ImageLightbox items={[item({ id: 'a' }), item({ id: 'b' })]} onClose={vi.fn()} />)
    expect(screen.getByTestId('lightbox-filmstrip')).toBeInTheDocument()

    act(() => {
      fireEvent.wheel(stageOf(), { deltaY: -120, clientX: 10, clientY: 10 })
    })
    expect(screen.queryByTestId('lightbox-filmstrip')).toBeNull()
    const prev = screen.getByLabelText(label('lightbox.previous'), { selector: 'button' })
    expect(prev.className).toContain('pointer-events-none')
  })

  /**
   * « Toucher Signal » : au-delà des bornes le glisser s'étire au lieu de se
   * bloquer net (on sent le bord), et le relâchement ramène la photo dans le
   * cadre. jsdom n'ayant pas de mise en page, la borne vaut PAN_EDGE_MARGIN.
   */
  it('étire le pan au-delà du bord, puis le ramène au relâchement', () => {
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    act(() => {
      fireEvent.wheel(stageOf(), { deltaY: -120, clientX: 10, clientY: 10 })
    })
    const container = containerOf()
    fireEvent.pointerDown(container, { button: 0, pointerId: 1, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 700, clientY: 300 })

    const draggedX = Number(/translate\((-?[\d.]+)px/.exec(imgOf().style.transform)?.[1])
    expect(draggedX).toBeGreaterThan(32)

    fireEvent.pointerUp(container, { pointerId: 1, clientX: 700, clientY: 300 })
    const releasedX = Number(/translate\((-?[\d.]+)px/.exec(imgOf().style.transform)?.[1])
    expect(releasedX).toBe(32)
  })

  it('ferme au glisser-vers-le-bas, mais pas sur un petit mouvement', () => {
    const onClose = vi.fn()
    render(<ImageLightbox items={[item()]} onClose={onClose} />)
    const container = containerOf()

    // Course courte : la scène suit le doigt puis revient, sans fermer.
    fireEvent.pointerDown(container, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 200 })
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 200, clientY: 260 })
    expect(stageOf().style.transform).toContain('translate(0px, 60px)')
    fireEvent.pointerUp(container, { pointerId: 1, clientX: 200, clientY: 260 })
    expect(stageOf().style.transform).toBe('')

    // Le clic de relâchement du geste ne ferme pas non plus (on est sur le fond).
    fireEvent.click(container)
    expect(onClose).not.toHaveBeenCalled()

    // Descente franche : fermeture.
    fireEvent.pointerDown(container, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 200 })
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 200, clientY: 400 })
    fireEvent.pointerUp(container, { pointerId: 1, clientX: 200, clientY: 400 })
    expect(onClose).toHaveBeenCalled()
  })

  it('zoome au double-clic à 2,5× puis revient à l’ajustement', () => {
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    fireEvent.doubleClick(imgOf())
    expect(imgOf().style.transform).toContain('scale(2.5)')
    fireEvent.doubleClick(imgOf())
    expect(imgOf().style.transform).toContain('scale(1)')
  })

  it('applique le pincement sans transition de transform', () => {
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    const root = containerOf().parentElement as HTMLElement
    fireEvent.touchStart(root, {
      touches: [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 200 }],
    })
    expect(imgOf().style.transition).not.toContain('transform')

    fireEvent.touchEnd(root, { touches: [] })
    expect(imgOf().style.transition).toContain('transform')
  })

  /**
   * La visionneuse vit dans une ligne virtualisée : sans piège, Tab ressort
   * derrière le fond. Et un bandeau effacé ne doit pas rester dans le cycle.
   */
  it('piège Tab dans le dialogue et ignore les contrôles masqués', () => {
    render(<ImageLightbox items={[item(), item({ id: 'b' })]} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
    const first = buttons[0]
    const last = buttons[buttons.length - 1]

    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    // Clic sur la photo : les bandeaux s'effacent, leurs boutons sortent du cycle.
    fireEvent.click(imgOf())
    const visible = buttons.filter((el) => !el.closest('[aria-hidden="true"]'))
    expect(visible.length).toBeLessThan(buttons.length)
    const lastVisible = visible[visible.length - 1]
    lastVisible.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(visible[0])
  })
})

/**
 * La visionneuse fermait sur un « Escape » recopié dans le code : après un
 * re-réglage de « Fermer la boîte de dialogue », elle restait la seule surface
 * de l'application à obéir à l'ancienne touche — et la croix ne le disait pas.
 */
describe('fermeture réglée de la visionneuse', () => {
  const comboBaseline = { ...useUIStore.getState().settings.keyboardShortcuts }
  const closeKey = () => screen.getByRole('button', { name: label('lightbox.close') })

  const bind = (combo: string) => {
    const current = useUIStore.getState().settings.keyboardShortcuts
    act(() => {
      useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, closeModal: combo } })
    })
  }

  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
    act(() => {
      useUIStore.getState().updateSettings({ keyboardShortcuts: { ...comboBaseline } })
    })
  })

  it('nomme la touche réglée sur sa croix', () => {
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    expect(closeKey()).toHaveAttribute('aria-keyshortcuts', 'Escape')

    bind('Ctrl+Shift+X')
    expect(closeKey()).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+X')
    expect(closeKey().getAttribute('title')).toBe(`${label('lightbox.close')} — Ctrl + Shift + X`)

    bind('')
    expect(closeKey()).not.toHaveAttribute('aria-keyshortcuts')
    expect(closeKey().getAttribute('title')).toBe(label('lightbox.close'))
  })

  it('obéit à la touche réglée, plus à « Escape » déplacée', () => {
    const onClose = vi.fn()
    render(<ImageLightbox items={[item()]} onClose={onClose} />)
    bind('Ctrl+Shift+X')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('garde la touche pendant une composition, et rend le geste éteint à la page', () => {
    const onClose = vi.fn()
    render(<ImageLightbox items={[item()]} onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    fireEvent.keyDown(window, { key: 'Escape', keyCode: 229 })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    cleanup()
    const again = vi.fn()
    render(<ImageLightbox items={[item()]} onClose={again} />)
    bind('')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(again).not.toHaveBeenCalled()

    // La croix reste le geste sûr : c'est elle qui referme sans touche réglée.
    fireEvent.click(closeKey())
    expect(again).toHaveBeenCalledOnce()
  })
})

/**
 * Trois libellés mentaient encore : le dialogue sans alt ni nom tombait sur le
 * mot anglais « image » ; la bascule plein écran gardait « Plein écran » une
 * fois en plein écran ; et le conseil de glisser promettait « Échap » en dur,
 * alors que la touche de fermeture se règle.
 */
describe('libellés honnêtes de la visionneuse', () => {
  const comboBaseline = { ...useUIStore.getState().settings.keyboardShortcuts }
  const bind = (combo: string) => {
    const current = useUIStore.getState().settings.keyboardShortcuts
    act(() => {
      useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, closeModal: combo } })
    })
  }

  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
    act(() => {
      useUIStore.getState().updateSettings({ keyboardShortcuts: { ...comboBaseline } })
    })
  })

  it('nomme le dialogue avec un mot traduit quand la photo n’a ni alt ni nom', () => {
    render(<ImageLightbox items={[item({ alt: undefined })]} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog')).toHaveAccessibleName(label('lightbox.image'))
    expect(label('lightbox.image')).not.toBe('image')
  })

  it('nomme le bouton plein écran d’après l’état qu’il produit', () => {
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    const enter = screen.getByRole('button', { name: label('lightbox.fullscreen') })
    expect(enter.getAttribute('title')).toBe(label('lightbox.fullscreen'))

    const dialog = screen.getByRole('dialog')
    const descriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
    try {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => dialog })
      act(() => {
        document.dispatchEvent(new Event('fullscreenchange'))
      })

      const exit = screen.getByRole('button', { name: label('lightbox.exitFullscreen') })
      expect(exit.getAttribute('title')).toBe(label('lightbox.exitFullscreen'))
      expect(screen.queryByRole('button', { name: label('lightbox.fullscreen') })).toBeNull()
    } finally {
      if (descriptor) Object.defineProperty(document, 'fullscreenElement', descriptor)
      else Reflect.deleteProperty(document, 'fullscreenElement')
    }
  })

  const panHint = (shortcut: string) =>
    `${label('lightbox.dragToPan')} · ${String(i18n.t('lightbox.closeHint', { shortcut }))}`

  it('nomme la touche réglée dans le conseil de glisser, sans jamais promettre Échap', () => {
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    act(() => {
      fireEvent.wheel(stageOf(), { deltaY: -120, clientX: 10, clientY: 10 })
    })

    const configured = formatCombo(useUIStore.getState().settings.keyboardShortcuts.closeModal) as string
    expect(screen.getByText(panHint(configured))).toBeInTheDocument()

    bind('Ctrl+Shift+X')
    expect(screen.getByText(panHint('Ctrl + Shift + X'))).toBeInTheDocument()
    expect(screen.queryByText(panHint('Échap'))).toBeNull()
  })

  it('se tait sur la fermeture quand le geste est éteint', () => {
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
    act(() => {
      fireEvent.wheel(stageOf(), { deltaY: -120, clientX: 10, clientY: 10 })
    })

    bind('')
    expect(screen.getByText(label('lightbox.dragToPan'))).toBeInTheDocument()
  })

  it('ne grave aucune touche dans les 25 langues', () => {
    const catalog = readFileSync(join(process.cwd(), 'src/i18n/translations.ts'), 'utf8')
    const values = (key: string) =>
      Array.from(catalog.matchAll(new RegExp(`^      "${key}": "(.*)",$`, 'gm'))).map((m) => m[1])

    const drags = values('lightbox.dragToPan')
    const hints = values('lightbox.closeHint')
    const names = values('lightbox.image')

    expect(drags).toHaveLength(25)
    expect(hints).toHaveLength(25)
    expect(names).toHaveLength(25)
    for (const value of drags) expect(value).not.toMatch(/esc|échap/i)
    for (const value of hints) expect(value).toContain('{{shortcut}}')
    for (const value of names) expect(value.trim().length).toBeGreaterThan(0)
  })
})

/**
 * Les vignettes sans alt n'étaient nommées que par leur rang — un lecteur
 * d'écran annonçait « 1 », « 2 », sans dire de quoi. Une photo sans alt ni nom
 * laissait aussi le bandeau et l'alternative vides : seul le dialogue portait
 * un nom.
 */
describe('vignettes et photo sans nom', () => {
  const values = (key: string) =>
    Array.from(
      readFileSync(join(process.cwd(), 'src/i18n/translations.ts'), 'utf8')
        .matchAll(new RegExp(`^      "${key}": "(.*)",$`, 'gm')),
    ).map((m) => m[1])

  it('nomme chaque vignette sans alt par son rang, dans la langue de l’interface', () => {
    render(
      <ImageLightbox
        items={[item({ id: 'a', alt: undefined }), item({ id: 'b', alt: 'b.png' })]}
        onClose={vi.fn()}
      />,
    )
    const strip = screen.getByTestId('lightbox-filmstrip')

    expect(
      within(strip).getByRole('button', { name: String(i18n.t('lightbox.thumbnail', { index: 1 })) }),
    ).toBeInTheDocument()
    expect(within(strip).getByRole('button', { name: 'b.png' })).toBeInTheDocument()
  })

  it('replie la photo sans nom sur le libellé générique, dans le bandeau et dans l’image', () => {
    render(<ImageLightbox items={[item({ alt: undefined })]} onClose={vi.fn()} />)

    expect(screen.getByAltText(label('lightbox.image'))).toBeInTheDocument()
    expect(screen.getByText(label('lightbox.image'))).toBeInTheDocument()
  })

  it('porte la clé de vignette dans les 25 langues, avec son rang', () => {
    const thumbs = values('lightbox.thumbnail')

    expect(thumbs).toHaveLength(25)
    for (const value of thumbs) expect(value).toContain('{{index}}')
  })
})

/**
 * Le bouton Télécharger de la visionneuse posait une ancre blob : il ignorait le
 * dossier réglé dans les paramètres, ne disait rien quand la source manquait, et
 * pouvait enregistrer le corps d'un 404 comme une photo.
 */
describe('téléchargement de la visionneuse', () => {
  const downloadButton = () => screen.getByRole('button', { name: label('lightbox.download') })
  const toasts = () => useUIStore.getState().toasts.map((toast) => `${toast.type}:${toast.title}`)
  const beforeStorage = useUIStore.getState().settings.storage
  const urlApi = URL as unknown as { createObjectURL: unknown; revokeObjectURL: unknown }
  const previousCreate = urlApi.createObjectURL
  const previousRevoke = urlApi.revokeObjectURL

  beforeEach(() => {
    useUIStore.setState({ toasts: [] })
    vi.mocked(window.asgard.file.saveAs).mockReset()
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: false, reason: 'canceled' })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    useUIStore.getState().updateSettings({ storage: beforeStorage })
    useUIStore.setState({ toasts: [] })
    // Le toast est libellé à l'émission : on laisse un éteignoir permanent pour
    // le `revokeObjectURL` différé, que le test ne doit pas rendre orphelin.
    if (previousCreate === undefined) urlApi.createObjectURL = () => 'blob:stub'
    else urlApi.createObjectURL = previousCreate
    if (previousRevoke === undefined) urlApi.revokeObjectURL = () => {}
    else urlApi.revokeObjectURL = previousRevoke
  })

  it('passe par le pont natif quand la photo est une pièce jointe', async () => {
    const downloadPath = 'D:\\Images'
    useUIStore.getState().updateSettings({
      storage: { ...useUIStore.getState().settings.storage, downloadPath },
    })
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: true, filePath: 'D:\\Images\\photo.png' })
    render(<ImageLightbox items={[item({ blobKey: 'blob-1' })]} onClose={vi.fn()} />)

    fireEvent.click(downloadButton())

    // Le réglage de dossier va jusqu'au dialogue natif, et le succès se voit.
    await waitFor(() =>
      expect(window.asgard.file.saveAs).toHaveBeenCalledWith('blob-1', 'photo.png', downloadPath),
    )
    expect(toasts()).toEqual([`success:${label('chat.fileSaved')}`])
  })

  it('ne dit rien quand la fenêtre d’enregistrement est fermée sans choix', async () => {
    render(<ImageLightbox items={[item({ blobKey: 'blob-1' })]} onClose={vi.fn()} />)

    fireEvent.click(downloadButton())

    await waitFor(() => expect(window.asgard.file.saveAs).toHaveBeenCalled())
    expect(toasts()).toEqual([])
  })

  it('garde l’ancre blob pour une URL sans pièce jointe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['pixels'], { type: 'image/png' }),
    }))
    urlApi.createObjectURL = vi.fn(() => 'blob:download')
    urlApi.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
      fireEvent.click(downloadButton())

      await waitFor(() => expect(click).toHaveBeenCalledOnce())
      expect(window.asgard.file.saveAs).not.toHaveBeenCalled()
      expect(toasts()).toEqual([])
    } finally {
      click.mockRestore()
    }
  })

  it('refuse d’enregistrer le corps d’une réponse HTTP en échec', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      blob: async () => new Blob(['page introuvable']),
    }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)
      fireEvent.click(downloadButton())

      await waitFor(() => expect(toasts()).toEqual([`error:${label('chat.downloadFailed')}`]))
      expect(click).not.toHaveBeenCalled()
    } finally {
      click.mockRestore()
    }
  })

  it('annonce une source injoignable au lieu d’échouer en silence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<ImageLightbox items={[item()]} onClose={vi.fn()} />)

    fireEvent.click(downloadButton())

    await waitFor(() => expect(toasts()).toEqual([`error:${label('chat.downloadFailed')}`]))
    expect(useUIStore.getState().toasts[0].message).toBe(label('chat.saveError'))
  })

  it('transmet la clé de blob depuis la pièce jointe', () => {
    const attachment = readFileSync(
      join(process.cwd(), 'src/features/chat/components/FileAttachment.tsx'),
      'utf8',
    )
    expect(attachment).toContain('blobKey: att.blobKey')
  })
})
