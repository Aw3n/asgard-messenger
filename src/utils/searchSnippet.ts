export interface SearchSnippet {
  before: string
  match: string
  after: string
  clippedStart: boolean
  clippedEnd: boolean
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff

/**
 * Extrait autour de la correspondance au lieu de rendre le début du message :
 * une requête trouvée au 300e caractère affichait un aperçu où le mot cherché
 * n'apparaissait pas. Le contexte est borné à `maxLength` caractères et les
 * bords ne coupent jamais une paire de substitution (emoji).
 */
export function buildSearchSnippet(
  content: string,
  query: string,
  maxLength = 80,
): SearchSnippet {
  const trimmed = query.trim()
  let index = -1
  let matched = ''
  if (trimmed) {
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const found = content.match(new RegExp(escaped, 'i'))
    if (found?.index !== undefined) {
      index = found.index
      matched = found[0]
    }
  }

  if (index === -1) {
    const end = Math.min(content.length, maxLength)
    return { before: content.slice(0, end), match: '', after: '', clippedStart: false, clippedEnd: end < content.length }
  }

  const context = Math.max(0, maxLength - matched.length)
  let start = Math.max(0, index - Math.floor(context / 2))
  let end = Math.min(content.length, start + maxLength)
  start = Math.max(0, end - maxLength)
  // Une fenêtre démarrant sur un demi-surrogate afficherait un caractère de
  // remplacement ; décaler d'un cran garde l'emoji entier.
  if (start > 0 && isLowSurrogate(content.charCodeAt(start))) start += 1
  if (end < content.length && isHighSurrogate(content.charCodeAt(end - 1))) end -= 1
  end = Math.max(end, index + matched.length)

  return {
    before: content.slice(start, index),
    match: matched,
    after: content.slice(index + matched.length, end),
    clippedStart: start > 0,
    clippedEnd: end < content.length,
  }
}
