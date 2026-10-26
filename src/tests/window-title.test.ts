/**
 * Titre de fenêtre : le total des non-lus (1:1 + canaux de groupe) doit être
 * visible dans la barre des tâches, plafonné à 99+.
 */
import { describe, it, expect } from 'vitest'
import { formatWindowTitle } from '@/utils/windowTitle'

describe('formatWindowTitle', () => {
  it('garde le nom seul sans non-lu', () => {
    expect(formatWindowTitle('Asgard', 0)).toBe('Asgard')
    expect(formatWindowTitle('Asgard', -1)).toBe('Asgard')
  })

  it('préfixe le total des non-lus', () => {
    expect(formatWindowTitle('Asgard', 3)).toBe('(3) Asgard')
  })

  it('plafonne au-delà de 99', () => {
    expect(formatWindowTitle('Asgard', 99)).toBe('(99) Asgard')
    expect(formatWindowTitle('Asgard', 120)).toBe('(99+) Asgard')
  })
})
