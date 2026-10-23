/**
 * La section des réglages est portée par l'URL.
 *
 * `SettingsPage` gardait sa section dans un `useState` : rien d'extérieur ne
 * pouvait la désigner, ni un lien ni le raccourci `openProfile`, qui retombait
 * toujours sur la première section. Ces tests rendent la page sur une URL
 * ciblée, vérifient qu'une valeur inconnue ne rend pas une page vide, et que
 * le clic écrit bien la section dans l'URL.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="url">{`${location.pathname}${location.search}`}</div>
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const url = () => screen.getByTestId('url').textContent

const SECTIONS = [
  'profile', 'appearance', 'language', 'chat', 'media', 'notifications', 'privacy',
  'security', 'accessibility', 'shortcuts', 'network', 'devices', 'storage', 'about',
]

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

const baselineNotifications = useUIStore.getState().settings.notifications

beforeEach(() => {
  useUIStore.getState().updateSettings({
    notifications: { ...baselineNotifications, enabled: true, scheduledDnd: true, dndFrom: '22:00', dndTo: '07:00' },
  })
})

afterEach(() => {
  cleanup()
  useUIStore.getState().updateSettings({ notifications: { ...baselineNotifications } })
})

describe('section ciblée par l’URL', () => {
  it('ouvre la section demandée par le lien', () => {
    renderAt('/settings?section=notifications')
    expect(screen.getByRole('heading', { level: 3, name: 'settings.notifications' })).toBeInTheDocument()
  })

  it('rend les deux heures silencieuses dans la section visée', () => {
    renderAt('/settings?section=notifications')
    expect(screen.getByLabelText('settings.scheduledDndFrom')).toHaveValue('22:00')
  })

  it('tombe sur le profil sans paramètre', () => {
    renderAt('/settings')
    expect(screen.getByRole('heading', { level: 3, name: 'settings.profile' })).toBeInTheDocument()
  })

  it('ignore une section que la page ne connaît pas', () => {
    renderAt('/settings?section=invention')
    expect(screen.getByRole('heading', { level: 3, name: 'settings.profile' })).toBeInTheDocument()
  })

  it('connaît chacune de ses sections', () => {
    const page = readFileSync(join(process.cwd(), 'src/features/settings/SettingsPage.tsx'), 'utf8')
    const nav = page.slice(page.indexOf('const sections:'), page.indexOf('return (', page.indexOf('const sections:')))
    const declaredIds = [...nav.matchAll(/\{ id: '([a-z]+)', label: t\('settings\./g)].map((m) => m[1])
    const accepted = page.slice(page.indexOf('const SECTION_IDS'), page.indexOf('function sectionFromParam'))

    // Le tableau de la page et la liste acceptée par l'URL ne doivent pas
    // dériver : une section absente de `SECTION_IDS` cesse d'être atteignable
    // par un lien ou par le raccourci du profil, sans le dire.
    expect(declaredIds.sort()).toEqual([...SECTIONS].sort())
    for (const id of declaredIds) expect(accepted).toContain(`'${id}'`)
  })

  it('rend la section visée, trois panels différents y compris', () => {
    for (const id of ['profile', 'notifications', 'storage']) {
      renderAt(`/settings?section=${id}`)
      expect(
        screen.getByRole('button', { name: `settings.${id}` }),
      ).toHaveAttribute('aria-current', 'page')
      cleanup()
    }
  })

  it('écrit la section cliquée dans l’URL', () => {
    renderAt('/settings')
    fireEvent.click(screen.getByRole('button', { name: 'settings.storage' }))
    expect(url()).toBe('/settings?section=storage')
  })
})
