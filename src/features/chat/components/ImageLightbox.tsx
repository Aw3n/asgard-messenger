import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

/**
 * One entry of the photo gallery shown by the lightbox.
 * `src` is whatever is available right now (full-resolution URL if the file was
 * already fetched, otherwise the thumbnail), `loadFull` resolves the original.
 */
export interface LightboxItem {
  id: string
  src: string
  alt?: string
  /** Fetch the original attachment (object URL). Return null when unavailable. */
  loadFull?: () => Promise<string | null>
  /** true when `src` is only a thumbnail — the original must be fetched to zoom usefully */
  preview?: boolean
}

interface ImageLightboxProps {
  /**
   * Gallery to display. A single-image viewer is just a one-entry gallery, which
   * keeps prev/next, the counter and the lazy original loading uniform.
   */
  items: LightboxItem[]
  startIndex?: number
  onClose: () => void
  /** Suggested file name for the download (defaults to the alt/name of the item) */
  fileName?: string
}

type View = { scale: number; x: number; y: number }

const MIN_SCALE = 1
/** Hard ceiling: beyond this a bitmap becomes a mosaic and rendering gets slow. */
const ABSOLUTE_MAX_SCALE = 16
/** Zoom reached by a double-click / double-tap. */
const DETAIL_SCALE = 3
/** Garde une image plus petite que la scène à portée de vue pendant un glisser. */
const PAN_EDGE_MARGIN = 32
/**
 * Surface utile de la scène : les bandeaux sont en surimpression sur le même
 * `inset-0`, donc mesurer l'ajustement et les bornes du pan sur tout le
 * viewport laissait le haut et le bas de la photo coincés derrière les boutons
 * — une image « rognée » qu'aucun glisser ne pouvait dégager.
 *
 * Les valeurs ci-dessous ne sont que des valeurs d'attente : les bandeaux sont
 * réellement mesurés au montage (et au redimensionnement), parce que leur
 * hauteur dépend du réglage de taille de police. `CHROME_GAP_PX` laisse un
 * filet d'air entre la photo et le bord d'un bandeau.
 */
const CHROME_TOP_PX = 58
const CHROME_BOTTOM_PX = 46
/** Place laissée aux flèches de galerie, superposées à gauche et à droite. */
const CHROME_SIDE_PX = 60
const CHROME_GAP_PX = 6
/** Two taps closer than this count as a double tap (touch has no dblclick). */
const DOUBLE_TAP_MS = 320

/**
 * ImageLightbox — full-screen photo viewer.
 *
 * Zoom is anchored on the pointer (wheel / pinch / double-click), so the detail
 * under the cursor stays under the cursor instead of drifting away. The pan is
 * bounded by the image size, the image can never be lost off-screen, and the
 * original is fetched on demand: a conversation thumbnail is only a downscaled
 * preview, zooming it without loading the source would just show blur.
 *
 * Everything is measured on the stage rather than on the viewport: the tool bars
 * are overlays on the same `inset-0`, and bounding the pan by the viewport left
 * the outermost bands of the picture permanently hidden behind them.
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  items,
  startIndex = 0,
  onClose,
  fileName,
}) => {
  const { t } = useTranslation()
  const gallery = items.length > 1 ? items : null

  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0)))
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [fullUrl, setFullUrl] = useState<string | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [fullFailed, setFullFailed] = useState(false)
  /** La source courante n'a produit aucun pixel — panneau d'erreur, jamais l'icône cassée. */
  const [srcFailed, setSrcFailed] = useState(false)
  /** Compteur de tentatives : incrémenté par « Réessayer », remonte l'<img>. */
  const [attempt, setAttempt] = useState(0)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  /** Retraits réellement appliqués à la scène, mesurés sur les bandeaux. */
  const [insets, setInsets] = useState({ top: CHROME_TOP_PX, bottom: CHROME_BOTTOM_PX, side: 0 })

  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  /** Conteneur retranché des bandeaux : c'est lui qui définit « entier ». */
  const stageRef = useRef<HTMLDivElement>(null)
  const topBarRef = useRef<HTMLDivElement>(null)
  const bottomBarRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLButtonElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  /** Timestamp of the last tap — touch devices report no dblclick. */
  const lastTapAt = useRef(0)
  /** Source pour laquelle la récupération par `loadFull` a déjà été tentée. */
  const recoveredFor = useRef<string | null>(null)

  const current = useMemo(() => items[Math.min(index, items.length - 1)], [items, index])
  const displaySrc = fullUrl ?? current?.src ?? ''
  const showingOriginal = !!fullUrl || (current ? !current.preview : true)

  // Keep the latest values reachable from listeners registered once.
  const stateRef = useRef({ view, index, items })
  useEffect(() => { stateRef.current = { view, index, items } })

  // ── Zoom maths ─────────────────────────────────────────────────────────────

  /** Ceiling for the current image: a bit past pixel-perfect, never pure mush. */
  const maxScale = useCallback(() => {
    const img = imgRef.current
    if (!img || !img.offsetWidth || !natural.w) return 8
    const oneToOne = natural.w / img.offsetWidth
    return Math.min(ABSOLUTE_MAX_SCALE, Math.max(2.5, oneToOne * 2))
  }, [natural])

  /**
   * Élément sur lequel se mesurent l'ajustement et les bornes du pan. La scène
   * n'est pas montée quand aucune source ne peut rendre de pixel : on retombe
   * alors sur le conteneur, qui ne peut rien déplacer de toute façon.
   */
  const frame = useCallback((): HTMLElement | null => stageRef.current ?? containerRef.current, [])

  /** Keep the image from being panned out of sight. */
  const clampView = useCallback((v: View): View => {
    const cont = frame()
    const img = imgRef.current
    if (!cont || !img) return v
    const w = img.offsetWidth * v.scale
    const h = img.offsetHeight * v.scale
    // Quand l'image dépasse la scène, la borne est exactement de quoi amener son
    // bord au ras de la scène : la marge habituelle ouvrirait alors un vide sur
    // le côté opposé, qui s'interprète comme « la photo est coupée là ». Quand
    // elle est plus petite, elle reste à portée de vue quel que soit le glisser.
    const limit = (size: number, stageSize: number) => (
      size > stageSize ? (size - stageSize) / 2 : PAN_EDGE_MARGIN
    )
    const maxX = limit(w, cont.clientWidth)
    const maxY = limit(h, cont.clientHeight)
    return {
      scale: v.scale,
      x: Math.min(maxX, Math.max(-maxX, v.x)),
      y: Math.min(maxY, Math.max(-maxY, v.y)),
    }
  }, [frame])

  /**
   * Apply a new scale while keeping the content point under (clientX, clientY)
   * fixed. The image is centred, so a screen offset `o` from the centre maps to
   * the content point (o - pos) / scale — solving for pos after the scale change
   * gives `o - (o - pos) * ratio`.
   *
   * It is a pure transition of a given view: consecutive wheel ticks must each
   * build on the previous one, so the callers go through the functional setter
   * instead of reading state that may not be committed yet.
   */
  const rescale = useCallback((v: View, target: number, clientX?: number, clientY?: number): View => {
    const cont = frame()
    if (!cont) return v
    const rect = cont.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const scale = Math.min(Math.max(target, MIN_SCALE), maxScale())
    const ratio = scale / v.scale
    const ox = (clientX ?? cx) - cx
    const oy = (clientY ?? cy) - cy
    let x = ox - (ox - v.x) * ratio
    let y = oy - (oy - v.y) * ratio
    if (scale <= MIN_SCALE + 0.001) { x = 0; y = 0 }
    return clampView({ scale, x, y })
  }, [clampView, frame, maxScale])

  const zoomTo = useCallback((target: number, clientX?: number, clientY?: number) => {
    setView((v) => rescale(v, target, clientX, clientY))
  }, [rescale])

  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setView((v) => rescale(v, v.scale * factor, clientX, clientY))
  }, [rescale])

  const fitToWindow = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), [])

  /** Ramène l'échelle dans les bornes courantes (le plafond change avec l'image). */
  const clampScale = useCallback((v: View): View => {
    const max = maxScale()
    const scale = Math.min(Math.max(v.scale, MIN_SCALE), max)
    return scale === v.scale ? v : { ...v, scale }
  }, [maxScale])

  /** 1 image pixel = 1 screen pixel. */
  const showActualSize = useCallback(() => {
    const img = imgRef.current
    if (!img || !img.offsetWidth || !natural.w) return
    zoomTo(natural.w / img.offsetWidth)
  }, [natural, zoomTo])

  const toggleDetail = useCallback((clientX?: number, clientY?: number) => {
    setView((v) => (v.scale > MIN_SCALE + 0.02
      ? { scale: 1, x: 0, y: 0 }
      : rescale(v, Math.min(DETAIL_SCALE, maxScale()), clientX, clientY)))
  }, [maxScale, rescale])

  // ── Gallery navigation ─────────────────────────────────────────────────────

  const goRelative = useCallback((delta: number) => {
    const { index: i, items: list } = stateRef.current
    if (list.length < 2) return
    setView({ scale: 1, x: 0, y: 0 })
    setFullUrl(null)
    setFullFailed(false)
    setLoaded(false)
    setIndex((i + delta + list.length) % list.length)
  }, [])

  // ── Pointer drag to pan ────────────────────────────────────────────────────

  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null)
  const fingers = useRef(0)
  const pinch = useRef<{ dist: number; cx: number; cy: number; start: View } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || fingers.current > 1) return
    if (stateRef.current.view.scale <= MIN_SCALE + 0.001) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: stateRef.current.view.x, oy: stateRef.current.view.y }
    setDragging(true)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    setView((v) => clampView({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }))
  }, [clampView])

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (drag.current && drag.current.id === e.pointerId) {
      drag.current = null
      setDragging(false)
    }
  }, [])

  // ── Pinch to zoom (two fingers, anchored on their midpoint) ────────────────

  const touchPair = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    return {
      dist: Math.hypot(dx, dy) || 1,
      cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
    }
  }

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    fingers.current = e.touches.length
    if (e.touches.length === 2) {
      drag.current = null
      setDragging(false)
      const { dist, cx, cy } = touchPair(e)
      pinch.current = { dist, cx, cy, start: stateRef.current.view }
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinch.current) return
    e.preventDefault()
    const cont = frame()
    if (!cont) return
    const rect = cont.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const { dist, cx, cy } = touchPair(e)
    const p = pinch.current
    const scale = Math.min(Math.max(p.start.scale * (dist / p.dist), MIN_SCALE), maxScale())
    // Content point pinned at the initial midpoint, moved to the current one.
    const cX = (p.cx - centerX - p.start.x) / p.start.scale
    const cY = (p.cy - centerY - p.start.y) / p.start.scale
    let x = cx - centerX - cX * scale
    let y = cy - centerY - cY * scale
    if (scale <= MIN_SCALE + 0.001) { x = 0; y = 0 }
    setView(clampView({ scale, x, y }))
  }, [clampView, frame, maxScale])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    fingers.current = e.touches.length
    if (e.touches.length < 2) pinch.current = null
    if (e.touches.length === 0 && drag.current) { drag.current = null; setDragging(false) }
  }, [])

  // ── Native listeners: wheel must not be passive, or preventDefault is a no-op
  //    and the chat behind the overlay keeps scrolling instead of zooming. ─────

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Trackpad pinch arrives as ctrlKey+wheel: use a gentler, linear factor.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : e.deltaMode === 1 ? 0.05 : 0.0018))
      zoomBy(factor, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const el = rootRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await el.requestFullscreen()
    } catch (err) {
      console.warn('[ImageLightbox] fullscreen unavailable:', err)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); return
        case '+': case '=': zoomBy(1.3); return
        case '-': case '_': zoomBy(1 / 1.3); return
        case '0': fitToWindow(); return
        case '1': showActualSize(); return
        case 'f': case 'F': void toggleFullscreen(); return
        case 'ArrowRight':
          if (stateRef.current.items.length > 1) goRelative(1)
          else zoomBy(1.3)
          return
        case 'ArrowLeft':
          if (stateRef.current.items.length > 1) goRelative(-1)
          else zoomBy(1 / 1.3)
          return
      }
      // Vertical arrows pan: horizontal ones are taken by the gallery, and
      // dragging the image covers the rest.
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 60 : -60
        setView((v) => clampView({ ...v, y: v.y + step }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, zoomBy, fitToWindow, showActualSize, goRelative, clampView])

  /**
   * Les bandeaux ont une hauteur qui dépend du réglage de taille de police : on
   * les mesure au lieu de leur supposer une constante. Une mesure nulle (moteur
   * sans mise en page) laisse la valeur d'attente.
   */
  const measureChrome = useCallback(() => {
    const edge = (el: HTMLElement | null, fallback: number) => {
      const size = el?.offsetHeight ?? 0
      return size > CHROME_GAP_PX ? size + CHROME_GAP_PX : fallback
    }
    const arrow = arrowRef.current
    let side = 0
    if (gallery) {
      // Réserve = distance de la flèche depuis le bord + sa largeur + filet d'air.
      const measured = arrow ? arrow.offsetLeft + arrow.offsetWidth + CHROME_GAP_PX : 0
      side = measured > CHROME_GAP_PX ? measured : CHROME_SIDE_PX
    }
    setInsets((cur) => {
      const next = {
        top: edge(topBarRef.current, CHROME_TOP_PX),
        bottom: edge(bottomBarRef.current, CHROME_BOTTOM_PX),
        side,
      }
      return cur.top === next.top && cur.bottom === next.bottom && cur.side === next.side ? cur : next
    })
  }, [gallery])

  // Reframe when the viewport changes (window resize / entering fullscreen).
  useEffect(() => {
    const onResize = () => {
      measureChrome()
      setView((v) => clampView(v))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampView, measureChrome])

  // La surface utile change quand les bandeaux s'effacent (clic sur l'image),
  // quand on entre en plein écran, et dès qu'ils viennent d'être mesurés : sans
  // re-ancrage, les bornes du pan resteraient calculées sur l'ancienne boîte et
  // un bord de la photo demeurerait inaccessible.
  useEffect(() => {
    measureChrome()
    const id = requestAnimationFrame(() => setView((v) => clampView(v)))
    return () => cancelAnimationFrame(id)
  }, [chromeVisible, isFullscreen, insets, measureChrome, clampView])

  // Freeze the page behind and hand focus to the dialog.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    rootRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = ''
      previous?.focus?.({ preventScroll: true })
    }
  }, [])

  // Reset the stage whenever the visible item changes.
  useEffect(() => {
    setFullUrl(null)
    setFullFailed(false)
    setSrcFailed(false)
    setLoaded(false)
    setNatural({ w: 0, h: 0 })
    setView({ scale: 1, x: 0, y: 0 })
    setChromeVisible(true)
    recoveredFor.current = null
  }, [index, current?.id])

  // Original resolution: fetched as soon as the visible item is only a preview.

  useEffect(() => {
    const it = current
    if (!it?.preview || !it.loadFull) return
    let cancelled = false
    setLoadingFull(true)
    it.loadFull()
      .then((url) => {
        if (cancelled) return
        if (url) setFullUrl(url)
        else setFullFailed(true)
      })
      .catch((err) => {
        console.warn('[ImageLightbox] original load failed:', err)
        if (!cancelled) setFullFailed(true)
      })
      .finally(() => { if (!cancelled) setLoadingFull(false) })
    return () => { cancelled = true }
  }, [current])

  const handleDownload = useCallback(async () => {
    /** Récupère les octets puis déclenche l'enregistrement sous le nom d'origine. */
    const fetchFor = async (url: string): Promise<Blob> => (await fetch(url)).blob()
    try {
      let blob: Blob
      try {
        blob = await fetchFor(displaySrc)
      } catch (err) {
        // Source morte : on résout l'original (relecture du blob, puis du pair)
        // et on retente une fois au lieu d'échouer silencieusement.
        const url = current?.loadFull ? await current.loadFull() : null
        if (!url || url === displaySrc) throw err
        blob = await fetchFor(url)
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName || current?.alt || 'image'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      console.error('[ImageLightbox] Download failed:', err)
    }
  }, [displaySrc, fileName, current])

  /**
   * Une URL acceptée par le DOM peut quand même ne rendre aucun pixel : une
   * `blob:` héritée d'une session précédente (les messages sont persistés avec
   * leur localUrl), un transfert tronqué, un format non décodé. On ne laisse
   * JAMAIS l'icône de casse du navigateur à l'écran : d'abord une tentative de
   * récupération par `loadFull` (le fichier est souvent encore sur disque),
   * ensuite un panneau d'erreur explicite avec « Réessayer ».
   */
  const handleImgError = useCallback(() => {
    const failedSrc = displaySrc
    setLoaded(false)
    const loadFull = current?.loadFull
    if (!loadFull || recoveredFor.current === failedSrc) {
      setSrcFailed(true)
      return
    }
    recoveredFor.current = failedSrc
    setLoadingFull(true)
    Promise.resolve(loadFull())
      .then((url) => {
        // Même URL que celle qui vient d'échouer : insister ferait boucler.
        if (!url || url === failedSrc) setSrcFailed(true)
        else setFullUrl(url)
      })
      .catch(() => setSrcFailed(true))
      .finally(() => setLoadingFull(false))
  }, [displaySrc, current])

  /** Relance réellement le chargement : la clé de l'<img> change, donc requête. */
  const retrySource = useCallback(() => {
    recoveredFor.current = null
    setSrcFailed(false)
    setLoaded(false)
    setAttempt((n) => n + 1)
  }, [])

  const onImgLoad = useCallback(() => {
    const img = imgRef.current
    setLoaded(true)
    setSrcFailed(false)
    if (!img) return
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    // La miniature remplacée par l'original change la boîte de rendu : plafond
    // de zoom et bornes du pan sont recalculés sur la nouvelle géométrie, sinon
    // une vue déjà zoomée resterait réglée sur l'ancienne image.
    requestAnimationFrame(() => setView((v) => clampView(clampScale(v))))
  }, [clampView, clampScale])

  const zoomPercentage = Math.round(view.scale * 100)
  const isZoomed = view.scale > MIN_SCALE + 0.02
  const toolBtn = 'h-8 min-w-8 px-1.5 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs text-white/85'

  if (!displaySrc) return null

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={current?.alt || fileName || 'image'}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md outline-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Top bar ── */}
      <div
        ref={topBarRef}
        className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-2 px-3 py-2.5 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-200 ${chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-white/85 font-medium truncate max-w-[38vw]">{current?.alt ?? fileName}</span>
          <span className="text-[11px] text-white/50 px-2 py-0.5 rounded-full bg-white/10 tabular-nums shrink-0">
            {zoomPercentage}%
          </span>
          {natural.w > 0 && (
            <span className="hidden sm:inline text-[11px] text-white/40 px-2 py-0.5 rounded-full bg-white/10 tabular-nums shrink-0">
              {natural.w}×{natural.h}
            </span>
          )}
          {gallery && (
            <span className="text-[11px] text-white/50 px-2 py-0.5 rounded-full bg-white/10 tabular-nums shrink-0">
              {index + 1} / {items.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => zoomBy(1 / 1.3)} disabled={view.scale <= MIN_SCALE || srcFailed} className={toolBtn} title={t('lightbox.zoomOut')} aria-label={t('lightbox.zoomOut')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M19 13H5v-2h14v2z" /></svg>
          </button>
          <button onClick={fitToWindow} disabled={srcFailed} className={toolBtn} title={`${t('lightbox.fit')} · ${t('lightbox.resetZoom')}`} aria-label={t('lightbox.fit')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M5 5h5v2H7v3H5V5zm9 0h5v5h-2V7h-3V5zM5 14h2v3h3v2H5v-5zm12 0h2v5h-5v-2h3v-3z" /></svg>
          </button>
          <button onClick={showActualSize} disabled={srcFailed} className={toolBtn} title={t('lightbox.actualSize')} aria-label={t('lightbox.actualSize')}>1:1</button>
          <button onClick={() => zoomBy(1.3)} disabled={view.scale >= maxScale() || srcFailed} className={toolBtn} title={t('lightbox.zoomIn')} aria-label={t('lightbox.zoomIn')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
          </button>
          <div className="w-px h-6 bg-white/20 mx-1" />
          <button onClick={() => void toggleFullscreen()} className={toolBtn} title={isFullscreen ? t('lightbox.exitFullscreen') : t('lightbox.fullscreen')} aria-label={t('lightbox.fullscreen')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              {isFullscreen
                ? <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                : <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />}
            </svg>
          </button>
          <button onClick={() => void handleDownload()} disabled={srcFailed} className={toolBtn} title={t('lightbox.download')} aria-label={t('lightbox.download')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
          </button>
          <button onClick={onClose} className={toolBtn} title={t('lightbox.close')} aria-label={t('lightbox.close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </div>
      </div>

      {/* ── Stage ── */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center overflow-hidden touch-none select-none"
        style={{ cursor: isZoomed ? (dragging ? 'grabbing' : 'grab') : 'zoom-in', touchAction: 'none' }}
        onDoubleClick={(e) => { e.preventDefault(); toggleDetail(e.clientX, e.clientY) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClick={(e) => {
          // Backdrop only: clicking the picture must never close the viewer,
          // that is how a user reaches for the zoom. The stage is
          // `pointer-events-none`, so an empty click lands on the container; the
          // stage is accepted as well so the whole area around the picture stays
          // the dismiss surface.
          const backdrop = e.target === e.currentTarget || e.target === stageRef.current
          if (backdrop && !isZoomed) onClose()
        }}
      >
        {srcFailed ? (
          /* Aucun pixel possible : on l'explique et on propose la sortie, au lieu
             de laisser l'icône d'image brisée sur un fond noir. */
          <div
            className="relative z-10 flex flex-col items-center justify-center gap-3 px-8 py-10 text-center rounded-2xl bg-white/[0.06] border border-white/10 max-w-[34rem]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white" opacity="0.75">
                <path d="M21 5v6.59l-3-3.01-4 4.01-2-2-4 4-1.59-1.59L21 5zM3 6.41V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6.59l-2 2V19H7.41l-2-2H3V6.41L1.41 5 0 3.59 1.41 2 3 3.59zM19 19H5l4.2-4.2L11 16.6l4-4 4 4V19z" />
              </svg>
            </span>
            <p className="text-sm text-white/85">{t('lightbox.imageUnavailable')}</p>
            <p className="text-xs text-white/45 truncate max-w-full">{current?.alt ?? fileName}</p>
            <button
              onClick={retrySource}
              className="mt-1 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs text-white/85"
            >
              {t('lightbox.retry')}
            </button>
          </div>
        ) : (
          /*
            Scène = zone libre entre les bandeaux (et les flèches de galerie).
            L'image s'y ajuste à 100 % et le pan y est borné : tout bord de la
            photo peut donc être sorti des contrôles. `pointer-events-none` laisse
            les clics vides traverser vers le conteneur (fermeture), l'image
            reprenant la main sur elle-même.
          */
          <div
            ref={stageRef}
            data-testid="lightbox-stage"
            className="pointer-events-none absolute flex items-center justify-center"
            style={{
              left: insets.side,
              right: insets.side,
              top: chromeVisible ? insets.top : 0,
              bottom: chromeVisible ? insets.bottom : 0,
            }}
          >
            <img
              key={`${displaySrc}:${attempt}`}
              ref={imgRef}
              src={displaySrc}
              alt={current?.alt ?? fileName}
              className="pointer-events-auto max-w-full max-h-full object-contain select-none"
              style={{
                // A plain <img> on purpose: a motion component animating `scale`
                // would rebuild the transform property on its own and discard the
                // anchored zoom computed above.
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                transformOrigin: 'center center',
                opacity: loaded ? 1 : 0,
                transition: dragging
                  ? 'opacity .18s ease-out'
                  : 'transform 170ms cubic-bezier(.2,.7,.3,1), opacity .18s ease-out',
                willChange: 'transform',
              }}
              draggable={false}
              onLoad={onImgLoad}
              onError={handleImgError}
              onClick={(e) => {
                e.stopPropagation()
                // A single click only hides/shows the toolbars — it used to close the
                // whole viewer, which made any attempt at interacting a way to lose it.
                setChromeVisible((v) => !v)
              }}
              onTouchEnd={(e) => {
                // Touch has no dblclick: recognise the second tap ourselves.
                const now = Date.now()
                const tap = e.changedTouches[0]
                if (tap && now - lastTapAt.current < DOUBLE_TAP_MS) {
                  lastTapAt.current = 0
                  toggleDetail(tap.clientX, tap.clientY)
                } else {
                  lastTapAt.current = now
                }
              }}
            />
          </div>
        )}

        {/* Gallery arrows */}
        {gallery && (
          <>
            <button
              ref={arrowRef}
              onClick={(e) => { e.stopPropagation(); goRelative(-1) }}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 transition-colors"
              title={t('lightbox.previous')}
              aria-label={t('lightbox.previous')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goRelative(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 transition-colors"
              title={t('lightbox.next')}
              aria-label={t('lightbox.next')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
            </button>
          </>
        )}
      </div>

      {/* ── Bottom bar ── */}
      <div
        ref={bottomBarRef}
        className={`absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-200 ${chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {srcFailed ? (
          <p className="text-xs text-amber-300/80">{t('lightbox.loadFailed')}</p>
        ) : loadingFull ? (
          <p className="text-xs text-white/60 flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
            {t('lightbox.loadingOriginal')}
          </p>
        ) : !showingOriginal ? (
          <p className="text-xs text-amber-300/80">
            {fullFailed ? t('lightbox.loadFailed') : t('lightbox.previewOnly')}
          </p>
        ) : (
          <p className="text-xs text-white/45">{isZoomed ? t('lightbox.dragToPan') : t('lightbox.scrollZoom')}</p>
        )}
      </div>

      {/* Loading spinner while the picture itself is decoding */}
      {!loaded && !srcFailed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </motion.div>
  )
}
