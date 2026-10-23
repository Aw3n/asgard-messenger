import { describe, it, expect } from 'vitest'
import { buildSearchSnippet } from '@/utils/searchSnippet'

describe('buildSearchSnippet', () => {
  it('centre l’extrait sur une correspondance profonde, dans sa casse d’origine', () => {
    const content = `${'x'.repeat(300)}Le mot Recherché se cache ici ${'y'.repeat(300)}`
    const snippet = buildSearchSnippet(content, 'recherché')
    expect(snippet.match).toBe('Recherché')
    expect(snippet.before.endsWith('Le mot ')).toBe(true)
    expect(snippet.after.startsWith(' se cache ici')).toBe(true)
    expect(snippet.clippedStart).toBe(true)
    expect(snippet.clippedEnd).toBe(true)
    expect(snippet.before.length + snippet.match.length + snippet.after.length).toBeLessThanOrEqual(80)
  })

  it('ne rogne rien quand le message tient dans la fenêtre', () => {
    expect(buildSearchSnippet('bonjour monde', 'monde')).toEqual({
      before: 'bonjour ',
      match: 'monde',
      after: '',
      clippedStart: false,
      clippedEnd: false,
    })
  })

  it('retombe sur le début du message quand la requête est absente', () => {
    const snippet = buildSearchSnippet('a'.repeat(120), 'introuvable')
    expect(snippet.match).toBe('')
    expect(snippet.before).toHaveLength(80)
    expect(snippet.clippedStart).toBe(false)
    expect(snippet.clippedEnd).toBe(true)
  })

  it('traite les caractères regex de la requête littéralement', () => {
    expect(buildSearchSnippet('prix a+b', 'a+b').match).toBe('a+b')
    expect(buildSearchSnippet('prix aab', 'a+b').match).toBe('')
  })

  it('ne coupe pas une paire de substitution au début de la fenêtre', () => {
    const content = `${'x'.repeat(62)}😀${'a'.repeat(36)}needle${'z'.repeat(80)}`
    const snippet = buildSearchSnippet(content, 'needle')
    expect(snippet.match).toBe('needle')
    expect(snippet.clippedStart).toBe(true)
    const first = snippet.before.charCodeAt(0)
    expect(first >= 0xdc00 && first <= 0xdfff).toBe(false)
    expect(snippet.before.includes('\uFFFD')).toBe(false)
  })

  it('ne coupe pas une paire de substitution à la fin de la fenêtre', () => {
    const content = `${'x'.repeat(63)}needle${'a'.repeat(36)}😀${'z'.repeat(40)}`
    const snippet = buildSearchSnippet(content, 'needle')
    expect(snippet.match).toBe('needle')
    expect(snippet.clippedEnd).toBe(true)
    const last = snippet.after.charCodeAt(snippet.after.length - 1)
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
    expect(snippet.after.includes('\uFFFD')).toBe(false)
  })
})
