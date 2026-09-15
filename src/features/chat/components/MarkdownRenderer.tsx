import React, { useMemo } from 'react'
import { cn } from '@/utils/cn'
import { useUIStore } from '@/stores/uiStore'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * MarkdownRenderer — renders markdown content with support for:
 * bold, italic, code, code blocks, links, blockquotes, lists, headings.
 * Uses a lightweight custom parser (no external deps needed at runtime).
 * CHAT SETTINGS: autoEmoji converts text smileys to emoji ; inlinePreviews
 * auto-links bare URLs so they are clickable.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const rendered = useMemo(() => parseMarkdown(content), [content])

  return (
    <div className={cn('message-content', className)}>
      {rendered}
    </div>
  )
}

// ─── Simple Markdown Parser ──────────────────────────────────────────────────

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeContent: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block start/end
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-black/30 border border-asgard-border rounded-lg p-3 my-2 overflow-x-auto">
            <code className="text-xs font-mono text-asgard-text-primary">
              {codeContent.join('\n')}
            </code>
          </pre>
        )
        codeContent = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeContent.push(line)
      continue
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<br key={`br-${i}`} />)
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-sm font-bold text-asgard-text-primary mt-2 mb-1">
          {parseInline(line.slice(4))}
        </h3>
      )
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-base font-bold text-asgard-text-primary mt-2 mb-1">
          {parseInline(line.slice(3))}
        </h2>
      )
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-lg font-bold text-asgard-text-primary mt-2 mb-1">
          {parseInline(line.slice(2))}
        </h1>
      )
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-3 border-asgard-glacier/50 pl-3 text-asgard-text-secondary italic my-1">
          {parseInline(line.slice(2))}
        </blockquote>
      )
      continue
    }

    // Unordered list
    if (line.match(/^[-*] /)) {
      elements.push(
        <div key={`li-${i}`} className="flex gap-2 ml-3 my-0.5">
          <span className="text-asgard-glacier mt-0.5">•</span>
          <span className="text-sm">{parseInline(line.slice(2))}</span>
        </div>
      )
      continue
    }

    // Ordered list
    const orderedMatch = line.match(/^(\d+)\. /)
    if (orderedMatch) {
      elements.push(
        <div key={`ol-${i}`} className="flex gap-2 ml-3 my-0.5">
          <span className="text-asgard-text-muted text-xs mt-0.5 min-w-4">{orderedMatch[1]}.</span>
          <span className="text-sm">{parseInline(line.slice(orderedMatch[0].length))}</span>
        </div>
      )
      continue
    }

    // Normal paragraph
    elements.push(
      <p key={`p-${i}`} className="text-sm leading-5 my-0.5">
        {parseInline(line)}
      </p>
    )
  }

  // Handle unclosed code block
  if (inCodeBlock && codeContent.length > 0) {
    elements.push(
      <pre key="code-unclosed" className="bg-black/30 border border-asgard-border rounded-lg p-3 my-2 overflow-x-auto">
        <code className="text-xs font-mono text-asgard-text-primary">
          {codeContent.join('\n')}
        </code>
      </pre>
    )
  }

  return elements
}

function parseInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(<span key={key++}>{parseSimpleInline(remaining.slice(0, boldMatch.index))}</span>)
      }
      parts.push(<strong key={key++} className="font-semibold">{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length)
      continue
    }

    // Italic *text*
    const italicMatch = remaining.match(/\*(.+?)\*/)
    if (italicMatch && italicMatch.index !== undefined) {
      if (italicMatch.index > 0) {
        parts.push(<span key={key++}>{parseSimpleInline(remaining.slice(0, italicMatch.index))}</span>)
      }
      parts.push(<em key={key++} className="italic">{italicMatch[1]}</em>)
      remaining = remaining.slice(italicMatch.index + italicMatch[0].length)
      continue
    }

    // Inline code `text`
    const codeMatch = remaining.match(/`(.+?)`/)
    if (codeMatch && codeMatch.index !== undefined) {
      if (codeMatch.index > 0) {
        parts.push(<span key={key++}>{parseSimpleInline(remaining.slice(0, codeMatch.index))}</span>)
      }
      parts.push(
        <code key={key++} className="bg-asgard-surface-alt rounded px-1 py-0.5 text-xs font-mono">
          {codeMatch[1]}
        </code>
      )
      remaining = remaining.slice(codeMatch.index + codeMatch[0].length)
      continue
    }

    // Link [text](url)
    const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/)
    if (linkMatch && linkMatch.index !== undefined) {
      if (linkMatch.index > 0) {
        parts.push(<span key={key++}>{parseSimpleInline(remaining.slice(0, linkMatch.index))}</span>)
      }
      parts.push(
        <a key={key++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-asgard-glacier hover:underline">
          {linkMatch[1]}
        </a>
      )
      remaining = remaining.slice(linkMatch.index + linkMatch[0].length)
      continue
    }

    // No more matches — render the rest
    parts.push(<span key={key++}>{parseSimpleInline(remaining)}</span>)
    break
  }

  return <>{parts}</>
}

function parseSimpleInline(text: string): React.ReactNode {
  // Handle ~~strikethrough~~
  const strikeMatch = text.match(/~~(.+?)~~/)
  if (strikeMatch && strikeMatch.index !== undefined) {
    return (
      <>
        {strikeMatch.index > 0 && text.slice(0, strikeMatch.index)}
        <s className="line-through opacity-60">{strikeMatch[1]}</s>
        {parseSimpleInline(text.slice(strikeMatch.index + strikeMatch[0].length))}
      </>
    )
  }
  // CHAT SETTINGS: apply autoEmoji and bare-URL linkification to plain text runs
  const { autoEmoji, inlinePreviews } = useUIStore.getState().settings.chat
  let processed = text
  if (autoEmoji) processed = applyAutoEmoji(processed)
  if (inlinePreviews) return linkifyUrls(processed)
  return processed
}

// CHAT SETTINGS (chat.autoEmoji): classic text smileys → emoji equivalents.
// Applied at render time so the stored message content is never mutated.
const AUTO_EMOJI_MAP: Record<string, string> = {
  ':)': '🙂',
  ':-)': '🙂',
  ':(': '🙁',
  ':-(': '🙁',
  ':D': '😄',
  ':-D': '😄',
  ';)': '😉',
  ';-)': '😉',
  ":'(": '😢',
  ':P': '😛',
  ':-P': '😛',
  ':o': '😮',
  ':-o': '😮',
  ':O': '😮',
  ':-O': '😮',
  ':/': '😕',
  ':-/': '😕',
  '<3': '❤️',
  '</3': '💔',
  ':|': '😐',
  ':-|': '😐',
  ':*': '😘',
  '=)': '🙂',
  'xD': '😆',
  'XD': '😆',
}

function applyAutoEmoji(text: string): string {
  let result = text
  for (const [smiley, emoji] of Object.entries(AUTO_EMOJI_MAP)) {
    // Word-boundary-ish replacement: smiley surrounded by whitespace or string edges
    const escaped = smiley.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'g'), `$1${emoji}`)
  }
  return result
}

// CHAT SETTINGS (chat.inlinePreviews): turn bare http(s) URLs into clickable links
const URL_RE = /\bhttps?:\/\/[^\s<>()[\]"']+/g

function linkifyUrls(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let last = 0
  let key = 0
  for (const match of text.matchAll(URL_RE)) {
    const idx = match.index ?? 0
    if (idx > last) parts.push(text.slice(last, idx))
    // Trim trailing punctuation commonly glued to URLs in prose
    let url = match[0]
    const trailing = url.match(/[.,;:!?)]+$/)
    if (trailing) url = url.slice(0, url.length - trailing[0].length)
    parts.push(
      <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="text-asgard-glacier hover:underline break-all">
        {url}
      </a>
    )
    last = idx + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 && typeof parts[0] === 'string' ? (parts[0] as string) : <>{parts}</>
}
