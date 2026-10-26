/**
 * L'historique des téléchargements ne servait qu'à lire des noms : aucune ligne
 * ne permettait de réenregistrer un fichier encore présent sur disque. Le badge
 * de type, lui, affichait le sous-type MIME brut et débordait la rangée pour un
 * document Office — il suit désormais l'extension du nom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DownloadHistory } from '@/features/settings/components/DownloadHistory'
import { fileService } from '@/services/FileService'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      typeof opts?.count === 'number' ? `${key}#${opts.count}` : key,
    i18n: { language: 'fr', changeLanguage: vi.fn() },
  }),
}))

const LONG_SUBTYPE = 'vnd.openxmlformats-officedocument.wordprocessingml.document'

function seedDownload() {
  fileService.recordDownload({
    blobKey: 'blob-docx',
    fileName: 'contrat.docx',
    fileSize: 8192,
    mimeType: `application/${LONG_SUBTYPE}`,
    conversationId: 'conv-3',
  })
}

beforeEach(() => {
  localStorage.clear()
  useUIStore.setState({ toasts: [] })
  fileService.clearDownloadHistory()
  vi.mocked(window.asgard.file.saveAs).mockReset()
})

afterEach(() => {
  cleanup()
  fileService.clearDownloadHistory()
  localStorage.clear()
})

describe('historique des téléchargements', () => {
  it('réenregistre le fichier avec sa taille et sa conversation', async () => {
    seedDownload()
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: true, filePath: 'C:\\contrat.docx' })

    render(<DownloadHistory />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.saveAs' }))

    await waitFor(() =>
      expect(window.asgard.file.saveAs).toHaveBeenCalledWith('blob-docx', 'contrat.docx', expect.any(String)),
    )
    await waitFor(() => expect(useUIStore.getState().toasts[0]?.title).toBe('chat.fileSaved'))
    expect(fileService.getDownloadHistory()[0]).toMatchObject({
      blobKey: 'blob-docx',
      fileName: 'contrat.docx',
      fileSize: 8192,
      conversationId: 'conv-3',
    })
  })

  it('affiche l’extension, pas le sous-type MIME entier', () => {
    seedDownload()

    render(<DownloadHistory />)

    expect(screen.getByText('DOCX')).toBeInTheDocument()
    expect(screen.queryByText(LONG_SUBTYPE.toUpperCase())).not.toBeInTheDocument()
  })

  it('nomme le champ de recherche pour le lecteur d’écran', () => {
    render(<DownloadHistory />)

    expect(screen.getByLabelText('settings.searchDownloads')).toBeInTheDocument()
  })

  /** Le sous-titre juxtaposait le nombre et « aujourd'hui » passé en
   *  minuscules : la casse d'une langue ne se décide pas en code. Chaque
   *  segment porte désormais son propre libellé accentué. */
  it('compte les téléchargements du jour sans rabaisser le libellé', () => {
    seedDownload()

    render(<DownloadHistory />)

    expect(screen.getByText(/chat\.today \(settings\.totalDownloads#1\)/)).toBeInTheDocument()
  })
})

describe('vidage de l’historique', () => {
  const openConfirm = () => {
    fireEvent.click(screen.getByRole('button', { name: 'calls.clearHistory' }))
    return screen.getByRole('dialog', { name: 'calls.clearHistory' })
  }

  it('demande confirmation et ne vide rien avant l’acquiescement', () => {
    seedDownload()

    render(<DownloadHistory />)
    const dialog = openConfirm()

    expect(within(dialog).getByText('settings.clearDownloadHistoryWarning')).toBeInTheDocument()
    expect(fileService.getDownloadHistory()).toHaveLength(1)
  })

  it('vide l’historique après confirmation', () => {
    seedDownload()

    render(<DownloadHistory />)
    const dialog = openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: 'calls.clearHistory' }))

    expect(fileService.getDownloadHistory()).toHaveLength(0)
    expect(screen.queryByRole('dialog', { name: 'calls.clearHistory' })).toBeNull()
  })

  it('annuler garde l’historique', () => {
    seedDownload()

    render(<DownloadHistory />)
    openConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))

    expect(screen.queryByRole('dialog', { name: 'calls.clearHistory' })).toBeNull()
    expect(fileService.getDownloadHistory()).toHaveLength(1)
  })
})
