/**
 * Réglages : douze titres ne nommaient rien.
 *
 * Autant de `<label>` posés là, sans `htmlFor` ni `id` en face : le lecteur
 * d'écran annonçait « zone d'édition » vide pour le statut personnalisé, le
 * propos, le plafond de pairs, le micro, la caméra et le haut-parleur. Les six
 * autres n'étaient pas des champs mais des rangées de boutons (statut, thème,
 * taille de police, densité, qualités vidéo et audio) : un `htmlFor` n'y peut
 * rien. Le titre porte donc un `id`, la rangée devient `role="group"` nommée
 * par `aria-labelledby`, et le choix retenu se lit sur `aria-pressed` — sans
 * quoi quatre boutons « En ligne / Absent / Occupé / Invisible » se valent à
 * l'annonce et l'utilisateur ne sait plus où il en est.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/MediaDeviceService', () => ({
  mediaDeviceService: {
    getPreferences: () => ({ audioInput: 'mic-1', videoInput: 'cam-1', audioOutput: 'spk-1' }),
    getDevicesError: () => null,
    getMicrophones: () => [{ deviceId: 'mic-1', label: 'Micro du casque', kind: 'audioinput' }],
    getCameras: () => [{ deviceId: 'cam-1', label: 'Webcam intégrée', kind: 'videoinput' }],
    getSpeakers: () => [{ deviceId: 'spk-1', label: 'Haut-parleurs', kind: 'audiooutput' }],
    hasPermission: () => true,
    on: () => {},
    off: () => {},
    requestPermission: vi.fn().mockResolvedValue(true),
    setPreferredDevice: () => {},
    testMicrophone: vi.fn().mockResolvedValue(() => {}),
    testCamera: vi.fn().mockResolvedValue({ stream: {}, stop: () => {} }),
  },
}))

/**
 * `window.asgard` du setup ne connaît que le strict nécessaire : la section
 * Réseau interroge le pare-feu et les scores de pairs dès son montage. Et jsdom
 * n'implémente pas IntersectionObserver, dont l'avatar paresseux a besoin.
 */
beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
  Object.assign(window.asgard, {
    firewall: {
      getStatus: vi.fn().mockResolvedValue('not-configured'),
      configure: vi.fn().mockResolvedValue(undefined),
      runAsAdmin: vi.fn().mockResolvedValue(false),
    },
  })
  Object.assign(window.asgard.network, {
    getPeerScores: vi.fn().mockResolvedValue({}),
    updateConfig: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  })
})

// Le store d'UI persiste en localStorage : sans restitution, le choix changé
// dans un test déborderait sur l'annonce du test suivant.
const beforeSettings = useUIStore.getState().settings

afterEach(() => {
  cleanup()
  useUIStore.setState({ settings: beforeSettings })
})

/**
 * Le contenu des sections passe par un AnimatePresence `mode="wait"` : l'ancienne
 * section termine sa sortie avant que la nouvelle monte. Sans attente, la
 * requête porterait encore sur le profil.
 */
const openSection = async (label: string) => {
  fireEvent.click(screen.getByRole('button', { name: label }))
  await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: label })).toBeInTheDocument())
}

/** La rangée nommée, avec la clé de son titre. */
const group = (titleKey: string) => screen.getByRole('group', { name: titleKey })
const pressed = (root: HTMLElement) =>
  within(root).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')

describe('champs de la page de réglages', () => {
  it('nomme les trois champs du profil', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(screen.getByLabelText('settings.customStatus')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('settings.about')).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('nomme le curseur de pairs maximum', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await openSection('settings.network')

    expect(screen.getByLabelText('settings.maxPeers')).toHaveAttribute('type', 'range')
  })

  it('nomme les trois sélecteurs de périphériques', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await openSection('settings.devices')

    expect(screen.getByLabelText('settings.microphone')).toHaveValue('mic-1')
    expect(screen.getByLabelText('settings.camera')).toHaveValue('cam-1')
    expect(screen.getByLabelText('settings.speaker')).toHaveValue('spk-1')
  })

  it('distingue micro, caméra et haut-parleur : trois noms, trois contrôles', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await openSection('settings.devices')

    expect(screen.getByLabelText('settings.microphone')).not.toBe(screen.getByLabelText('settings.camera'))
    expect(screen.getByLabelText('settings.speaker')).not.toBe(screen.getByLabelText('settings.camera'))
  })
})

describe('rangées de boutons de la page de réglages', () => {
  it('nomme les six rangées comme groupes', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(group('settings.status')).toBeInTheDocument()
    await openSection('settings.appearance')
    expect(group('settings.theme')).toBeInTheDocument()
    expect(group('settings.fontSize')).toBeInTheDocument()
    await openSection('settings.chat')
    expect(group('settings.messageDensity')).toBeInTheDocument()
    await openSection('settings.media')
    expect(group('settings.defaultVideoQuality')).toBeInTheDocument()
    expect(group('settings.defaultAudioQuality')).toBeInTheDocument()
  })

  it('annonce un seul choix pressé par rangée', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(pressed(group('settings.status'))).toHaveLength(1)
    await openSection('settings.appearance')
    expect(pressed(group('settings.theme'))).toHaveLength(1)
    expect(pressed(group('settings.fontSize'))).toHaveLength(1)
    await openSection('settings.chat')
    expect(pressed(group('settings.messageDensity'))).toHaveLength(1)
    await openSection('settings.media')
    expect(pressed(group('settings.defaultVideoQuality'))).toHaveLength(1)
    expect(pressed(group('settings.defaultAudioQuality'))).toHaveLength(1)
  })

  it('reporte le choix pressé quand on change de police', async () => {
    useUIStore.getState().updateSettings({ fontSize: 'medium' })
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await openSection('settings.appearance')

    fireEvent.click(within(group('settings.fontSize')).getByRole('button', { name: 'settings.fontLarge' }))

    expect(useUIStore.getState().settings.fontSize).toBe('large')
    expect(pressed(group('settings.fontSize'))).toHaveLength(1)
    expect(pressed(group('settings.fontSize'))[0]).toHaveAccessibleName('settings.fontLarge')
  })

  it('ne laisse aucun libellé détaché derrière lui', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    // Un <label> dont le `for` ne mène nulle part est le défaut d'origine :
    // chaque libellé rendu ici doit désamorcer un contrôle existant.
    for (const label of Array.from(document.querySelectorAll('label[for]'))) {
      expect(document.getElementById(label.getAttribute('for') as string)).not.toBeNull()
    }
    expect(document.querySelectorAll('label:not([for])')).toHaveLength(0)
  })
})
