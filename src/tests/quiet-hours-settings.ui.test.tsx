/**
 * Carte Notifications : le calendrier du silence se pose, se lit et commande
 * réellement les trois sites d'alerte.
 *
 * Les deux heures réglables n'avaient ni champ ni lecteur ; l'interrupteur
 * manuel seul décidait. Ces tests rendent la section, écrivent les deux champs
 * dans le magasin, vérifient que la plage endormie ne se cache derrière un
 * bouton « activé » trompeur, et gardent la source des services : si l'un des
 * trois sites d'alerte relit encore `dndMode` tout nu, le calendrier ne coupe
 * rien la nuit.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}))

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

const source = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

const notif = () => useUIStore.getState().settings.notifications

const setNotif = (patch: Partial<ReturnType<typeof notif>>) =>
  useUIStore.getState().updateSettings({ notifications: { ...notif(), ...patch } })

async function openNotifications() {
  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('button', { name: 'settings.notifications' }))
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 3, name: 'settings.notifications' })).toBeInTheDocument(),
  )
}

const scheduleSwitch = () => screen.getByRole('switch', { name: 'settings.scheduledDnd' })
const fromField = () => screen.getByLabelText('settings.scheduledDndFrom') as HTMLInputElement
const toField = () => screen.getByLabelText('settings.scheduledDndTo') as HTMLInputElement

beforeEach(() => {
  // 13:00 un jeudi : hors de la plage 22:00 → 07:00, donc l'écran doit d'abord
  // dire « hors plage » avant que quiconque n'ait armé quoi que ce soit.
  // Seule l'horloge se fige : les minuteries de waitFor restent vraies.
  vi.useFakeTimers({ now: new Date(2026, 0, 15, 13, 0), toFake: ['Date'] })
  setNotif({ enabled: true, dndMode: false, scheduledDnd: false, dndFrom: undefined, dndTo: undefined })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('commandes de la carte Notifications', () => {
  it('nomme les deux champs d’heure et les laisse vides sans réglage', async () => {
    await openNotifications()
    expect(fromField().value).toBe('')
    expect(toField().value).toBe('')
  })

  /** Le calendrier n'a rien à commander tant que les notifications sont coupées. */
  it('endort les champs tant que le silence n’est pas armé', async () => {
    await openNotifications()
    expect(scheduleSwitch()).not.toBeChecked()
    expect(fromField()).toBeDisabled()
    expect(toField()).toBeDisabled()

    fireEvent.click(scheduleSwitch())
    await waitFor(() => expect(notif().scheduledDnd).toBe(true))
    expect(fromField()).not.toBeDisabled()
    expect(toField()).not.toBeDisabled()
  })

  it('écrit les deux heures dans le réglage que les services lisent', async () => {
    await openNotifications()
    fireEvent.click(scheduleSwitch())
    fireEvent.change(fromField(), { target: { value: '22:00' } })
    fireEvent.change(toField(), { target: { value: '07:00' } })

    await waitFor(() => expect(notif().dndFrom).toBe('22:00'))
    expect(notif().dndTo).toBe('07:00')
  })

  it('relit un réglage déjà posé avant l’ouverture du panneau', async () => {
    setNotif({ scheduledDnd: true, dndFrom: '22:00', dndTo: '07:00' })
    await openNotifications()
    expect(scheduleSwitch()).toBeChecked()
    expect(fromField().value).toBe('22:00')
    expect(toField().value).toBe('07:00')
  })

  /** « Réglé » et « en cours » sont deux états : l'écran doit dire lequel. */
  it('annonce l’heure en cours plutôt qu’un réglage', async () => {
    setNotif({ scheduledDnd: true, dndFrom: '22:00', dndTo: '07:00' })
    await openNotifications()
    expect(screen.getByText('settings.scheduledDndInactive')).toBeInTheDocument()
  })

  it('annonce le silence pendant la plage', async () => {
    vi.setSystemTime(new Date(2026, 0, 15, 23, 30))
    setNotif({ scheduledDnd: true, dndFrom: '22:00', dndTo: '07:00' })
    await openNotifications()
    expect(screen.getByText('settings.scheduledDndActive')).toBeInTheDocument()
  })

  /** L'interrupteur manuel doit se voir sur l'écran, pas seulement dans le magasin. */
  it('annonce le silence manuel hors de toute plage', async () => {
    setNotif({ dndMode: true })
    await openNotifications()
    expect(screen.getByText('settings.scheduledDndActive')).toBeInTheDocument()
  })
})

describe('garde de source', () => {
  const alerts = {
    'src/services/ChatService.ts': 1,
    'src/services/GroupService.ts': 2,
  }

  for (const [file, expected] of Object.entries(alerts)) {
    it(`${file.split('/').pop()} interroge l’horloge avant chaque alerte`, () => {
      const text = source(file)
      expect(text).toContain("import { isQuietNow } from '@/utils/quietHours'")
      expect(text.split('isQuietNow(').length - 1).toBe(expected)
    })
  }

  /** Un site qui relirait `dndMode` tout nu rendrait le calendrier muet la nuit. */
  it('ne laisse aucun site d’alerte relire l’interrupteur seul', () => {
    for (const file of Object.keys(alerts)) {
      expect(source(file)).not.toMatch(/notif\w*\.dndMode/)
    }
  })

  it('borne la décision à un seul module, hors des services', () => {
    expect(source('src/utils/quietHours.ts')).toContain('export function isQuietNow')
    expect(source('src/stores/uiStore.ts')).toContain('scheduledDnd: false')
  })
})
