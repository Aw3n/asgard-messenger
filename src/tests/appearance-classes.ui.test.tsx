/**
 * Apparence : les réglages qui posent réellement une classe sur <html>.
 *
 * Quatre classes d'accessibilité se posaient depuis un useEffect écrit en dur
 * dans App.tsx, et `customTheme.useGradient` — présent depuis les presets —
 * n'était lu par personne : la bascule « dégradé » se cliquait sans que bulles
 * ni boutons ne changent. Tout passe maintenant par un seul hook, et le dégradé
 * s'éteint en redéfinissant deux variables CSS : `background:` accepte couleur
 * ET dégradé, donc aucune règle consommatrice n'a besoin de connaître le
 * réglage. Les gardes de source verrouillent les deux côtés du mécanisme — un
 * `bg-gradient-to-br` survivant rendrait le réglage muet sur ce bouton, et un
 * second site de `classList.toggle('a11y-…')` remettrait le doublon à la mode.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { cleanup, act, fireEvent, render, screen } from '@testing-library/react'
import { useAppearanceClasses } from '@/hooks/useAppearanceClasses'
import { ThemeSelector } from '@/features/settings/components/ThemeSelector'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}))

const A11Y_CLASSES = ['a11y-high-contrast', 'a11y-reduced-motion', 'a11y-keyboard-nav', 'a11y-large-touch']

const Probe = () => {
  useAppearanceClasses()
  return null
}

const source = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8')
const root = () => document.documentElement

/** Les gardes de source balaient tout `src/` — les tests s'en excluent : ils
 *  citent textuellement le motif qu'ils interdisent, et se voir soi-même ne
 *  rend aucune garde valable. Le chemin se normalise en obliques pour que les
 *  attendus restent les mêmes sur les trois plateformes. */
const productionSources = (() => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      return entry.isDirectory() ? walk(full) : [relative(process.cwd(), full).split(sep).join('/')]
    })

  let cache: { path: string; text: string }[] | null = null
  return () => {
    if (!cache) {
      cache = walk('src')
        .filter((p) => !p.startsWith('src/tests/') && (p.endsWith('.ts') || p.endsWith('.tsx')))
        .map((p) => ({ path: p, text: source(p) }))
    }
    return cache
  }
})()

const customTheme = () => useUIStore.getState().settings.customTheme
const accessibility = () => useUIStore.getState().settings.accessibility

const setA11y = (patch: Partial<ReturnType<typeof accessibility>>) =>
  act(() => useUIStore.getState().updateSettings({ accessibility: { ...accessibility(), ...patch } }))

const setGradient = (useGradient: boolean) =>
  act(() => useUIStore.getState().updateSettings({ customTheme: { ...customTheme(), useGradient } }))

beforeEach(() => {
  setA11y({ highContrast: false, reducedMotion: false, keyboardNav: false, largerTouchTargets: false })
  setGradient(true)
  root().classList.remove(...A11Y_CLASSES, 'theme-flat')
})

afterEach(() => {
  cleanup()
  root().classList.remove(...A11Y_CLASSES, 'theme-flat')
})

describe('classes posées par le hook', () => {
  it('lit les quatre réglages d’accessibilité sur <html>', () => {
    setA11y({ highContrast: true, reducedMotion: true, keyboardNav: true, largerTouchTargets: true })
    render(<Probe />)
    for (const cls of A11Y_CLASSES) expect(root().classList.contains(cls)).toBe(true)
  })

  it('les retire quand le réglage s’éteint', () => {
    setA11y({ highContrast: true })
    render(<Probe />)
    expect(root().classList.contains('a11y-high-contrast')).toBe(true)

    setA11y({ highContrast: false })
    expect(root().classList.contains('a11y-high-contrast')).toBe(false)
  })

  /** Le dégradé allumé ne pose rien : c’est son absence qui se voit. */
  it('ne pose pas la classe d’aplat tant que le dégradé reste choisi', () => {
    render(<Probe />)
    expect(root().classList.contains('theme-flat')).toBe(false)
  })

  it('pose la classe d’aplat quand le dégradé s’éteint', () => {
    setGradient(false)
    render(<Probe />)
    expect(root().classList.contains('theme-flat')).toBe(true)
  })

  /** Un réglage qui ne se rejoue qu’au redémarrage n’est pas un réglage. */
  it('suit la bascule sans démonter l’écran', () => {
    render(<Probe />)
    setGradient(false)
    expect(root().classList.contains('theme-flat')).toBe(true)
    setGradient(true)
    expect(root().classList.contains('theme-flat')).toBe(false)
  })
})

describe('bascule à l’écran des thèmes', () => {
  const gradientSwitch = () => screen.getByRole('switch', { name: 'settings.useGradient' })

  /** Les deux interrupteurs du bloc se ressemblent pixel pour pixel : sans nom,
   *  un lecteur d'écran ne dit pas lequel éteint les couleurs personnalisées. */
  it('distingue la bascule dégradé de celle des couleurs', () => {
    render(
      <>
        <ThemeSelector />
        <Probe />
      </>,
    )
    expect(screen.getByRole('switch', { name: 'settings.customColors' })).toBeInTheDocument()
    expect(gradientSwitch()).toBeInTheDocument()
  })

  it('montre l’état du dégradé avant tout clic', () => {
    setGradient(false)
    render(
      <>
        <ThemeSelector />
        <Probe />
      </>,
    )
    expect(gradientSwitch()).not.toBeChecked()
    expect(root().classList.contains('theme-flat')).toBe(true)
  })

  it('coupe le dégradé de l’interface au premier clic', () => {
    render(
      <>
        <ThemeSelector />
        <Probe />
      </>,
    )
    fireEvent.click(gradientSwitch())
    expect(customTheme().useGradient).toBe(false)
    expect(root().classList.contains('theme-flat')).toBe(true)
  })

  /** Un preset écrit le customTheme en entier : il ramène son propre dégradé. */
  it('rend le dégradé quand un preset le choisit', () => {
    const presets = useUIStore.getState().getThemePresets()
    expect(presets.length).toBeGreaterThan(1)
    setGradient(false)
    render(<Probe />)
    expect(root().classList.contains('theme-flat')).toBe(true)

    act(() => useUIStore.getState().applyThemePreset(presets[1]))
    expect(customTheme().useGradient).toBe(presets[1].settings.useGradient)
    expect(root().classList.contains('theme-flat')).toBe(false)
  })
})

describe('garde de source', () => {
  const css = source('src/styles/globals.css')

  const ruleBody = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[2]
  }

  it('déclare le dégradé et son replat sur les mêmes variables', () => {
    expect(css).toMatch(/--asgard-accent-fill:\s*linear-gradient\(/)
    expect(css).toMatch(/--asgard-accent-fill-hover:\s*linear-gradient\(/)
    expect(ruleBody('html.theme-flat')).toContain('--asgard-accent-fill: rgb(var(--asgard-nordic))')
    expect(ruleBody('html.theme-flat')).toContain('--asgard-accent-fill-hover: rgb(var(--asgard-nordic-deep))')
  })

  /** Une règle qui écrirait encore le dégradé en dur passerait au-dessus du
   *  réglage : bulle et boutons principaux restent sur la variable. */
  it('laisse les surfaces d’accent lire la variable', () => {
    for (const selector of ['.message-bubble-own', '.btn-primary', '.btn-primary:hover', '.accent-fill', '.accent-fill:hover']) {
      const body = ruleBody(selector)
      expect(body, `${selector} absent de globals.css`).toBeDefined()
      expect(body).toContain('var(--asgard-accent-fill')
    }
    expect(css).not.toMatch(/\.light \.message-bubble-own\s*\{[^}]*linear-gradient/)
  })

  /** `theme-flat` ne peut pas éteindre une image de dégradé Tailwind : aucune
   *  couleur de fond en dessous. Le duo d'accent n'a donc plus droit de cité. */
  it('ne laisse aucun trio Tailwind d’accent lui échapper', () => {
    const offenders = productionSources()
      .filter(({ path, text }) => path.endsWith('.tsx') && /from-asgard-nordic\s+to-asgard-nordic-light/.test(text))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('distingue le bouton primaire du plat via accent-fill', () => {
    expect(source('src/components/ui/Button.tsx')).toMatch(/primary:\s*'accent-fill/)
    expect(source('src/features/chat/components/MessageInput.tsx')).toContain("'accent-fill text-white")
  })

  /** Un second site de toggle remettrait le doublon à la mode : la page de
   *  réglages et App.tsx doivent ignorer les classes, le hook seul les pose. */
  it('ne garde qu’un seul site qui pose les classes', () => {
    const setters = productionSources()
      .filter(({ text }) => /classList\.toggle\('(a11y-|theme-flat)/.test(text))
      .map(({ path }) => path)
    expect(setters).toEqual(['src/hooks/useAppearanceClasses.ts'])
    expect(source('src/App.tsx')).toContain('useAppearanceClasses()')
  })

  /** Les deux réglages morts sont supprimés, pas doublonnés : `chat.density`
   *  seul commande le serré du fil. */
  it('ne ressuscite ni la densité morte ni le miroir d’apparence', () => {
    const types = source('src/types/ui.ts')
    expect(types).not.toContain('CompactMode')
    expect(types).not.toMatch(/^\s*appearance:/m)
    const store = source('src/stores/uiStore.ts')
    expect(store).not.toContain('compactMode')
    expect(store).not.toMatch(/^\s*appearance:\s*\{/m)
    expect(source('src/features/settings/SettingsPage.tsx')).not.toContain('compactMode')
  })
})
