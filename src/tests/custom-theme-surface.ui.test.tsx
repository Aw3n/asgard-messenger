/**
 * Couleurs personnalisées : la pipette « Surface Color » peint enfin les surfaces.
 *
 * `customTheme.surfaceColor` existait dans le type, dans les huit presets et
 * sous forme de champ à l'écran ; `applyCustomThemeToCSS` ne la lisait jamais —
 * les deux branches sombre et clair déduisaient `--asgard-surface` du fond.
 * L'utilisateur réglait donc une couleur que rien n'affichait. La feuille
 * injectée est le seul endroit où la décision se voit : ces tests la lisent
 * block par block, et vérifient que le fond garde la main là où il l'avait
 * (les deux noirs) sans la reprendre là où la pipette parle (les surfaces).
 *
 * `media.imageZoom` suivait le même chemin — une valeur sans lecteur ni
 * contrôle ; la garde de source l'empêche de ressusciter.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { cleanup, act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ThemeSelector } from '@/features/settings/components/ThemeSelector'
import { useUIStore } from '@/stores/uiStore'
import { darkenColor, hexToCssRgb, invertColorForLight, lightenColor } from '@/utils/color'
import type { ThemePreset } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}))

const source = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8')

/** Les gardes balaient le code de production, jamais les tests : ceux-ci
 *  citent textuellement le nom du réglage qu'ils interdisent. */
const productionSources = (() => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      return entry.isDirectory() ? walk(full) : [relative(process.cwd(), full).split(sep).join('/')]
    })

  let cache: { path: string; text: string }[] | null = null
  return () => {
    if (!cache) {
      cache = ['src', 'electron']
        .flatMap(walk)
        .filter(
          (p) =>
            !p.startsWith('src/tests/') &&
            !p.startsWith('src/i18n/') &&
            (p.endsWith('.ts') || p.endsWith('.tsx')),
        )
        .map((p) => ({ path: p, text: source(p) }))
    }
    return cache
  }
})()

const customTheme = () => useUIStore.getState().settings.customTheme

const setTheme = (patch: Partial<ReturnType<typeof customTheme>>) =>
  act(() => useUIStore.getState().updateSettings({ customTheme: { ...customTheme(), ...patch } }))

const applyPreset = (preset: ThemePreset) =>
  act(() => useUIStore.getState().applyThemePreset(preset))

const sheet = () => document.getElementById('asgard-custom-theme') as HTMLStyleElement | null

const block = (mode: 'dark' | 'light') => {
  const selector = `html.${mode}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(sheet()?.textContent ?? '')?.[1] ?? ''
}

const readVar = (mode: 'dark' | 'light', name: string) =>
  new RegExp(`--asgard-${name}:\\s*([^;]+);`).exec(block(mode))?.[1].trim()

const clearSheet = () =>
  sheet()?.remove()

beforeAll(() => {
  // jsdom ne connaît pas scrollTo ; framer-motion l'appelle en mesurant ses
  // images clés pendant que l'éditeur de thème se déplie.
  window.scrollTo = () => {}
})

beforeEach(() => {
  clearSheet()
  setTheme({
    enabled: false,
    accentColor: '#4FC3F7',
    secondaryColor: '#7B68EE',
    backgroundColor: '#1a1b23',
    surfaceColor: '#252630',
    textPrimaryColor: '#ffffff',
    textSecondaryColor: '#a0a0a0',
    borderColor: '#3a3b45',
  })
})

afterEach(() => {
  cleanup()
  clearSheet()
})

describe('feuille injectée par les couleurs personnalisées', () => {
  it('n’existe pas tant que le réglage est éteint', () => {
    expect(sheet()).toBeNull()
  })

  it('peint la surface sombre avec la couleur de l’utilisateur', () => {
    setTheme({ enabled: true, surfaceColor: '#1b263b' })
    expect(hexToCssRgb('#1b263b')).not.toBeNull()
    expect(readVar('dark', 'surface')).toBe(hexToCssRgb('#1b263b'))
  })

  /** `surface-alt` est le relief de la surface : dériver du fond rendrait la
   *  pipette à moitié muette, l'œil ne voyant bouger que le niveau du dessous. */
  it('derive le relief de la surface, pas du fond', () => {
    setTheme({ enabled: true, backgroundColor: '#0d1b2a', surfaceColor: '#1b263b' })
    expect(readVar('dark', 'surface-alt')).toBe(hexToCssRgb(lightenColor('#1b263b', 5)))
  })

  /** Le fond reste maître des deux noirs : la pipette ne doit pas prendre la
   *  main là où elle n'a jamais été appelée. */
  it('laisse le fond commander les deux noirs', () => {
    setTheme({ enabled: true, backgroundColor: '#0d1b2a', surfaceColor: '#1b263b' })
    expect(readVar('dark', 'black')).toBe(hexToCssRgb(darkenColor('#0d1b2a', 5)))
    expect(readVar('dark', 'deep-black')).toBe(hexToCssRgb(darkenColor('#0d1b2a', 10)))

    const before = [readVar('dark', 'black'), readVar('dark', 'deep-black')]
    setTheme({ surfaceColor: '#ff0000' })
    expect([readVar('dark', 'black'), readVar('dark', 'deep-black')]).toEqual(before)
  })

  it('reprend la surface telle quelle dans un thème clair', () => {
    setTheme({ enabled: true, backgroundColor: '#f5f9ff', surfaceColor: '#eeeeee' })
    expect(readVar('light', 'surface')).toBe(hexToCssRgb('#eeeeee'))

    setTheme({ surfaceColor: '#123456' })
    expect(readVar('light', 'surface')).toBe(hexToCssRgb('#123456'))
    expect(readVar('light', 'surface-alt')).toBe(hexToCssRgb(darkenColor('#123456', 2)))
  })

  /** Un fond sombre n'a pas de surface sombre en mode clair : la même pipette
   *  doit s'inverser, sinon le texte clair se pose sur du clair. */
  it('inverse la surface pour le mode clair d’un fond sombre', () => {
    setTheme({ enabled: true, backgroundColor: '#0d1b2a', surfaceColor: '#1b263b' })
    expect(readVar('light', 'surface')).toBe(hexToCssRgb(invertColorForLight('#1b263b')))
  })

  /** Les huit presets portent leur propre surface ; si la feuille l'ignore,
   *  Ocean et Forest se ressemblent et le preset choisi se lit à moitié. */
  it('pose la surface propre à chaque preset', () => {
    const seen = new Set<string>()
    for (const preset of useUIStore.getState().getThemePresets()) {
      applyPreset(preset)
      const painted = readVar('dark', 'surface')
      expect(painted, `${preset.name} : --asgard-surface absente de la feuille`).toBe(
        hexToCssRgb(preset.settings.surfaceColor),
      )
      seen.add(painted as string)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('retire la feuille quand l’utilisateur éteint les couleurs personnalisées', () => {
    setTheme({ enabled: true, surfaceColor: '#1b263b' })
    expect(sheet()).not.toBeNull()
    setTheme({ enabled: false })
    expect(sheet()).toBeNull()
  })
})

describe('pipette de surface dans l’éditeur de thème', () => {
  /** La rangée porte son titre en `aria-labelledby` : `getAllByLabelText` non
   *  filtré désignerait aussi le groupe. On entre dans la rangée, puis on y
   *  prend la pastille — premier des deux contrôles de cette valeur. */
  const pipette = async () => {
    const row = await screen.findByRole('group', { name: 'settings.surfaceColor' })
    return within(row).getAllByLabelText('settings.surfaceColor')[0] as HTMLInputElement
  }

  /** Le chemin complet : interrupteur des couleurs personnalisées, ouverture de
   *  l'éditeur, changement de couleur → la feuille doit suivre. Une pipette
   *  qui écrit dans le magasin sans être relue passait déjà tous les tests. */
  it('peint dès qu’on la bouge à l’écran', async () => {
    render(<ThemeSelector />)
    fireEvent.click(screen.getByRole('switch', { name: 'settings.customColors' }))
    fireEvent.click(screen.getByRole('button', { name: /coloreditor/i }))

    const swatch = await pipette()
    expect(swatch.value).toBe('#252630')

    fireEvent.change(swatch, { target: { value: '#8a2be2' } })
    await waitFor(() => expect(customTheme().surfaceColor).toBe('#8a2be2'))
    expect(readVar('dark', 'surface')).toBe(hexToCssRgb('#8a2be2'))
    expect(readVar('light', 'surface')).toBe(hexToCssRgb(invertColorForLight('#8a2be2')))
  })
})

describe('garde de source', () => {
  it('écrit la surface à partir de la pipette dans les deux branches', () => {
    const store = source('src/stores/uiStore.ts')
    expect(store).toContain('const darkSurface = customTheme.surfaceColor')
    expect(store).toContain('customTheme.surfaceColor ||')
    expect(store).toMatch(/--asgard-surface: \$\{toRgb\(darkSurface/)
    expect(store).toMatch(/--asgard-surface: \$\{toRgb\(lightSurface/)
  })

  /** Un réglage sans lecteur ni contrôle est une fausse promesse faite à
   *  l'utilisateur : `media.imageZoom` est supprimée, pas redoublonnée. */
  it('ne ressuscite aucun réglage muet', () => {
    for (const dead of ['imageZoom']) {
      const offenders = productionSources()
        .filter(({ text }) => text.includes(dead))
        .map(({ path }) => path)
      expect(offenders, `${dead} est de retour dans ${offenders.join(', ')}`).toEqual([])
      expect(source('src/types/ui.ts')).not.toContain(dead)
      expect(source('src/stores/uiStore.ts')).not.toContain(dead)
    }
  })
})
