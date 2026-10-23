/**
 * Section Stockage : la taille limite et le dossier d'enregistrement se règlent
 * et se lisent jusqu'au process principal.
 *
 * `autoDownload.maxSize` borne déjà l'auto-téléchargement dans FileService sans
 * aucun curseur pour le changer, et `storage.downloadPath` était exporté, importé,
 * affiché — jamais transmis à la boîte de dialogue, qui ouvrait son emplacement
 * système. Le main-process, lui, écrivait « Enregistrer le fichier » en français
 * pour les 25 langues. Ces tests rendent la section, jouent les deux commandes et
 * gardent la source du pont : un réglage qui ne traverse pas l'IPC n'est pas un
 * réglage.
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

const source = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

const pickFolder = () => vi.mocked(window.asgard.dialog.pickFolder)

const toasts = () => useUIStore.getState().toasts

async function openStorage() {
  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('button', { name: 'settings.storage' }))
  await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'settings.storage' })).toBeInTheDocument())
}

const setStorage = (patch: Partial<typeof beforeStorage>) =>
  useUIStore.getState().updateSettings({
    storage: { ...useUIStore.getState().settings.storage, ...patch },
  })

const setAutoDownload = (patch: Partial<typeof beforeStorage.autoDownload>) =>
  setStorage({ autoDownload: { ...useUIStore.getState().settings.storage.autoDownload, ...patch } })

beforeEach(() => {
  Object.assign(window.asgard.storage, { getSize: vi.fn().mockResolvedValue(0) })
  useUIStore.setState({ toasts: [] })
  setStorage({ cacheSize: 500, downloadPath: '' })
  setAutoDownload({ maxSize: 50 })
  pickFolder().mockReset().mockResolvedValue({ success: false, reason: 'canceled' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useUIStore.getState().updateSettings({ storage: beforeStorage })
  useUIStore.setState({ toasts: [] })
})

describe('curseur de taille maximale', () => {
  it('porte un nom et la valeur du réglage que le service lit', async () => {
    await openStorage()

    const slider = screen.getByLabelText('settings.autoDownloadMaxLabel')
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveValue('50')
  })

  it('écrit le plafond et le dit à l’écran', async () => {
    await openStorage()

    fireEvent.change(screen.getByLabelText('settings.autoDownloadMaxLabel'), { target: { value: '120' } })

    expect(useUIStore.getState().settings.storage.autoDownload.maxSize).toBe(120)
    expect(screen.getByText('120 settings.mbLimit')).toBeInTheDocument()
  })

  it('suit un réglage déjà posé avant l’ouverture du panneau', async () => {
    setAutoDownload({ maxSize: 5 })
    await openStorage()

    expect(screen.getByLabelText('settings.autoDownloadMaxLabel')).toHaveValue('5')
    expect(screen.getByText('5 settings.mbLimit')).toBeInTheDocument()
  })
})

describe('dossier d’enregistrement', () => {
  it('nomme l’absence de réglage sans inventer un chemin', async () => {
    await openStorage()

    expect(screen.getByText('settings.downloadFolderNone')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'settings.downloadFolderReset' })).toBeNull()
  })

  it('garde le chemin choisi par le dialogue natif', async () => {
    await openStorage()
    pickFolder().mockResolvedValue({ success: true, path: 'D:\\Asgard\\Reçus' })

    fireEvent.click(screen.getByRole('button', { name: 'settings.downloadFolderChoose' }))

    expect(pickFolder()).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(useUIStore.getState().settings.storage.downloadPath).toBe('D:\\Asgard\\Reçus'))
    expect(screen.queryByText('settings.downloadFolderNone')).toBeNull()
    expect(screen.getByText('D:\\Asgard\\Reçus')).toBeInTheDocument()
  })

  it('ne touche au réglage quand le dialogue est refermé sans choix', async () => {
    setStorage({ downloadPath: 'D:\\Asgard\\Reçus' })
    await openStorage()
    pickFolder().mockResolvedValue({ success: false, reason: 'canceled' })

    fireEvent.click(screen.getByRole('button', { name: 'settings.downloadFolderChoose' }))

    await waitFor(() => expect(pickFolder()).toHaveBeenCalledTimes(1))
    expect(useUIStore.getState().settings.storage.downloadPath).toBe('D:\\Asgard\\Reçus')
    expect(toasts()).toEqual([])
  })

  it('annonce une panne du sélecteur', async () => {
    await openStorage()
    pickFolder().mockResolvedValue({ success: false, reason: 'error', message: 'dialogue indisponible' })

    fireEvent.click(screen.getByRole('button', { name: 'settings.downloadFolderChoose' }))

    await waitFor(() => expect(toasts().length).toBe(1))
    expect(toasts()[0]).toMatchObject({ type: 'error', title: 'settings.downloadFolder' })
    expect(toasts()[0].message).toBe('dialogue indisponible')
    expect(useUIStore.getState().settings.storage.downloadPath).toBe('')
  })

  it('rend sa liberté au dossier par défaut', async () => {
    setStorage({ downloadPath: 'D:\\Asgard\\Reçus' })
    await openStorage()

    fireEvent.click(screen.getByRole('button', { name: 'settings.downloadFolderReset' }))

    expect(useUIStore.getState().settings.storage.downloadPath).toBe('')
    expect(screen.getByText('settings.downloadFolderNone')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'settings.downloadFolderReset' })).toBeNull()
  })
})

describe('pont du main-process', () => {
  it('ne parle plus français dans ses boîtes de dialogue', () => {
    const handlers = source('electron/ipc/handlers.ts')
    expect(handlers).not.toMatch(/title: 'Enregistrer le fichier'/)
    expect(handlers).not.toMatch(/name: 'Fichiers'/)
    expect(handlers).toMatch(/dialogLabels\(uiLanguage\)/)
    expect(handlers).toMatch(/SUPPORTED_LANGUAGES\.includes\(lang\)/)
  })

  it('fait traverser le dossier réglé par l’IPC', () => {
    const handlers = source('electron/ipc/handlers.ts')
    const saveAs = handlers.slice(
      handlers.indexOf("ipcMain.handle('file:save-as'"),
      handlers.indexOf("ipcMain.handle('file:open'"),
    )
    expect(saveAs.length).toBeGreaterThan(200)
    expect(saveAs).toMatch(/downloadDir\?: string/)
    expect(saveAs).toMatch(/normalizeDownloadDir\(downloadDir\)/)
    expect(saveAs).toMatch(/isExistingDirectory\(/)
    expect(saveAs).toMatch(/defaultPath: saveDefaultPath\(dir, suggestedName\)/)
    expect(source('src/utils/attachmentSave.ts')).toMatch(/saveAs\(attachment\.blobKey, attachment\.name, settings\.storage\.downloadPath\)/)
  })

  it('expose le sélecteur de dossier des deux côtés du pont', () => {
    expect(source('electron/ipc/handlers.ts')).toMatch(/ipcMain\.handle\('dialog:pick-folder'/)
    expect(source('electron/preload.ts')).toMatch(/pickFolder: \(\) => ipcRenderer\.invoke\('dialog:pick-folder'\)/)
    expect(source('src/types/electron.ts')).toMatch(/pickFolder: \(\) => Promise</)
  })

  it('borne le sélecteur aux dossiers, jamais aux fichiers', () => {
    const handlers = source('electron/ipc/handlers.ts')
    const picker = handlers.slice(handlers.indexOf("ipcMain.handle('dialog:pick-folder'"))
    expect(picker).toMatch(/properties: \['openDirectory', 'createDirectory'\]/)
  })
})
