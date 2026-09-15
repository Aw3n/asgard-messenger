import React, { useEffect, useState } from 'react'

interface LinkPreviewData {
  url: string
  hostname: string
  title: string | null
  description: string | null
}

// Module-level cache — each URL is fetched at most once per session
const resultCache = new Map<string, LinkPreviewData | null>()

/**
 * LinkPreview — PRIVACY SETTINGS (privacy.linkPreviews): renders a compact
 * Open Graph preview card for a URL. Metadata is fetched by the MAIN process
 * (window.asgard.app.fetchLinkPreview) — the renderer never contacts the
 * linked host directly, and nothing is fetched at all when the setting is off.
 */
export const LinkPreview: React.FC<{ url: string }> = ({ url }) => {
  const [preview, setPreview] = useState<LinkPreviewData | null | undefined>(
    resultCache.has(url) ? resultCache.get(url) : undefined
  )

  useEffect(() => {
    if (resultCache.has(url)) {
      setPreview(resultCache.get(url))
      return
    }
    let cancelled = false
    window.asgard.app.fetchLinkPreview(url)
      .then((data) => {
        resultCache.set(url, data)
        if (!cancelled) setPreview(data)
      })
      .catch(() => {
        resultCache.set(url, null)
        if (!cancelled) setPreview(null)
      })
    return () => { cancelled = true }
  }, [url])

  // Nothing fetched yet, fetch failed, or no useful metadata — no card
  if (preview === undefined || preview === null) return null
  if (!preview.title && !preview.description) return null

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        window.asgard.app.openExternal(preview.url)
      }}
      className="block mt-1.5 max-w-[300px] rounded-xl border border-asgard-border bg-black/20 hover:bg-asgard-surface-alt/60 transition-colors px-3 py-2 no-underline"
    >
      {preview.title && (
        <p className="text-xs font-semibold text-asgard-glacier truncate">{preview.title}</p>
      )}
      {preview.description && (
        <p className="text-xxs text-asgard-text-secondary line-clamp-2 mt-0.5">{preview.description}</p>
      )}
      <p className="text-xxs text-asgard-text-muted mt-1 truncate">{preview.hostname}</p>
    </a>
  )
}
