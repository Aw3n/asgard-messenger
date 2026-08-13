import React, { useMemo } from 'react'
import { cn } from '@/utils/cn'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * MarkdownRenderer — renders markdown content with support for:
 * bold, italic, code, code blocks, links, blockquotes, lists, headings.
 * Uses a lightweight custom parser (no external deps needed at runtime).
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
  return text
}
