/**
 * Section Stockage : le plafond se règle, se lit et se calcule.
 *
 * Le panneau affichait « X utilisé sur 500 MB » avec un 500 MB que personne
 * n'écrivait ni n'appliquait, et sa liste de bascules s'arrêtait aux vidéos
 * alors que les documents avaient un réglage lu par le service. Ces tests rendent
 * la section et vérifient que le curseur change la valeur, que la barre se
 * recalcule sans démonter la section, et que chaque interrupteur se nomme.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  // Le plafond doit se lire dans la chaîne d'annonce : un mock qui rendrait la
  // seule clé ne prouverait pas que la valeur est passée à l'interpolation.
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}))

const MB = 1024 * 1024

// jsdom n'implémente pas IntersectionObserver, dont l'avatar paresseux de
// l'en-tête de la page a besoin dès le montage.
beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

const beforeStorage = useUIStore.getState().settings.storage

/** La taille que le stockage répond à la mesure de la barre. */
function measuredStorage(bytes: number) {
  Object.assign(window.asgard.storage, { getSize: vi.fn().mockResolvedValue(bytes) })
}

async function openStorage() {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  )
  fireEvent.click(screen.getByRole('button', { name: 'settings.storage' }))
  await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'settings.storage' })).toBeInTheDocument())
}

const usedLine = () => screen.getByText(/settings\.usedOf/)

beforeEach(() => {
  measuredStorage(0)
  useUIStore.setState({ toasts: [] })
  useUIStore.getState().updateSettings({
    storage: { ...beforeStorage, cacheSize: 500, autoDownload: { ...beforeStorage.autoDownload, documents: false } },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useUIStore.getState().updateSettings({ storage: beforeStorage })
})

describe('curseur de plafond', () => {
  it('porte un nom et la valeur du réglage', async () => {
    await openStorage()

    const slider = screen.getByLabelText('settings.cacheLimitLabel')
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveValue('500')
  })

  it('écrit la valeur dans les réglages, aux deux endroits qui l’affichent', async () => {
    await openStorage()

    fireEvent.change(screen.getByLabelText('settings.cacheLimitLabel'), { target: { value: '1200' } })

    expect(useUIStore.getState().settings.storage.cacheSize).toBe(1200)
    // Pastille de la carte et lecture du curseur : l'une redondait avec l'autre,
    // les deux doivent au moins dire la même chose.
    expect(screen.getAllByText('1200 settings.mbLimit')).toHaveLength(2)
    expect(screen.queryByText('500 settings.mbLimit')).toBeNull()
  })

  it('recalcule la barre sans démonter la section', async () => {
    measuredStorage(250 * MB)
    await openStorage()

    expect(await screen.findByText(/250\.0 MB settings\.usedOf 500 MB \(50%\)/)).toBeInTheDocument()

    // Aucun rerender : c'est la souscription au store qui doit faire bouger la
    // barre déjà posée.
    fireEvent.change(screen.getByLabelText('settings.cacheLimitLabel'), { target: { value: '1000' } })

    expect(usedLine().textContent).toBe('250.0 MB settings.usedOf 1000 MB (25%)')
  })

  it('dit le dépassement avec le plafond en cours', async () => {
    measuredStorage(600 * MB)
    await openStorage()

    expect(await screen.findByText(/settings\.cacheLimitReached \{"limit":500\}/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('settings.cacheLimitLabel'), { target: { value: '700' } })

    expect(screen.queryByText(/settings\.cacheLimitReached/)).toBeNull()
  })

  it('reste muet sous le plafond', async () => {
    measuredStorage(400 * MB)
    await openStorage()

    await screen.findByText(/settings\.usedOf/)
    expect(screen.queryByText(/settings\.cacheLimitReached/)).toBeNull()
  })

  it('lit le plafond par une souscription, pas d’un coup d’œil au store', () => {
    // Garde de source : la page parente se re-rend à chaque réglage écrit et
    // remonte la section par la même occasion. Un `getState()` lu au rendu
    // passerait donc tous les tests ci-dessus — seul le texte le trahit.
    const src = readFileSync(join(process.cwd(), 'src/features/settings/SettingsPage.tsx'), 'utf8')
    const start = src.indexOf('const StorageSection: React.FC = () => {')
    const block = src.slice(start, src.indexOf('\nconst ', start + 10))

    expect(block.length).toBeGreaterThan(200)
    expect(block).toMatch(/const \{ settings, updateSettings \} = useUIStore\(\)/)
    expect(block).not.toMatch(/useUIStore\.getState\(\)\.settings/)
  })
})

describe('mesure de la taille utilisée', () => {
  it('annonce une mesure indisponible et propose de réessayer', async () => {
    const getSize = vi.fn()
      .mockRejectedValueOnce(new Error('pont fermé'))
      .mockResolvedValueOnce(250 * MB)
    Object.assign(window.asgard.storage, { getSize })
    await openStorage()

    // L'échec restait avalé : la ligne affichait « ... (0%) » sans fin, comme
    // une mesure toujours en cours sur un stockage vide.
    expect(await screen.findByText('settings.storageSizeUnavailable')).toBeInTheDocument()
    expect(screen.queryByText(/\(0%\)/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))

    expect(await screen.findByText(/250\.0 MB settings\.usedOf 500 MB \(50%\)/)).toBeInTheDocument()
    expect(screen.queryByText('settings.storageSizeUnavailable')).toBeNull()
    expect(screen.queryByRole('button', { name: 'common.retry' })).toBeNull()
  })

  it('ne prétend pas 0 % pendant la mesure', async () => {
    let settle: (bytes: number) => void = () => {}
    Object.assign(window.asgard.storage, {
      getSize: vi.fn(() => new Promise<number>((resolve) => { settle = resolve })),
    })
    await openStorage()

    expect(screen.getByText('...')).toBeInTheDocument()
    expect(screen.queryByText(/\(0%\)/)).toBeNull()

    await act(async () => { settle(0) })
  })
})

describe('bascules de téléchargement automatique', () => {
  it('offre les quatre types, chacun nommé', async () => {
    await openStorage()

    expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual([
      'settings.images',
      'settings.audio',
      'settings.videos',
      'settings.documents',
    ])
  })

  it('la bascule documents écrit le réglage que le service lit', async () => {
    await openStorage()

    const toggle = screen.getByRole('switch', { name: 'settings.documents' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)

    expect(useUIStore.getState().settings.storage.autoDownload.documents).toBe(true)
    expect(screen.getByRole('switch', { name: 'settings.documents' })).toHaveAttribute('aria-checked', 'true')
  })

  it('la bascule images écrit le réglage que le service lit', async () => {
    await openStorage()

    const toggle = screen.getByRole('switch', { name: 'settings.images' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(toggle)

    expect(useUIStore.getState().settings.storage.autoDownload.images).toBe(false)
  })
})
