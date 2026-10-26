/**
 * Libellés natifs du process principal et chemin de destination d'un « enregistrer ».
 *
 * electron/ipc/handlers.ts écrivait « Enregistrer le fichier » et « Fichiers » en
 * français pour les 25 langues, et storage.downloadPath, rangé dans le store,
 * n'était lu par personne : la boîte de dialogue ouvrait toujours son emplacement
 * système. Ces tests fixent la table de traductions du main-process et la garde
 * qui transforme un réglage en intention utilisable — ou en rien du tout.
 */
import { describe, expect, it } from 'vitest'
import path from 'path'
import { dialogLabels, normalizeDownloadDir, saveDefaultPath, SUPPORTED_LANGUAGES } from '../../electron/utils/dialogLabels'

const FRENCH_TITLE = 'Enregistrer le fichier'

describe('langues supportées', () => {
  it('couvre les 25 langues du catalogue', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(25)
    expect(new Set(SUPPORTED_LANGUAGES).size).toBe(25)
  })

  it('détient les trois libellés de chaque langue', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const labels = dialogLabels(lang)
      expect(labels, lang).toEqual({
        saveTitle: expect.any(String),
        filterName: expect.any(String),
        pickFolderTitle: expect.any(String),
      })
      expect(labels.saveTitle.trim(), lang).not.toBe('')
      expect(labels.filterName.trim(), lang).not.toBe('')
      expect(labels.pickFolderTitle.trim(), lang).not.toBe('')
    }
  })

  it('ne rend le libellé français qu’au français', () => {
    // C'était le défaut réel : une seule chaîne pour tout le monde.
    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === 'fr') continue
      expect(dialogLabels(lang).saveTitle, lang).not.toBe(FRENCH_TITLE)
    }
    expect(dialogLabels('fr').saveTitle).toBe(FRENCH_TITLE)
  })

  it('distingue chaque langue par son titre', () => {
    const titles = SUPPORTED_LANGUAGES.map((lang) => dialogLabels(lang).saveTitle)
    expect(new Set(titles).size).toBeGreaterThan(20)
  })

  it('retombe sur l’anglais pour une langue inconnue ou absente', () => {
    const en = dialogLabels('en')
    expect(dialogLabels('zz').saveTitle).toBe(en.saveTitle)
    expect(dialogLabels(undefined).saveTitle).toBe(en.saveTitle)
    expect(dialogLabels(null).filterName).toBe(en.filterName)
    expect(dialogLabels(42).pickFolderTitle).toBe(en.pickFolderTitle)
  })
})

describe('dossier enregistré dans les réglages', () => {
  it('garde un chemin absolu et le débarrasse de ses espaces', () => {
    const dir = path.join(path.parse(process.cwd()).root, 'Asgard', 'Dossiers')
    expect(normalizeDownloadDir(dir)).toBe(dir)
    expect(normalizeDownloadDir(`  ${dir}  `)).toBe(dir)
  })

  it('ignore un réglage vide ou blanc', () => {
    expect(normalizeDownloadDir('')).toBeUndefined()
    expect(normalizeDownloadDir('   ')).toBeUndefined()
    expect(normalizeDownloadDir(undefined)).toBeUndefined()
    expect(normalizeDownloadDir(null)).toBeUndefined()
    expect(normalizeDownloadDir(7)).toBeUndefined()
  })

  it('ignore un chemin relatif : il désignerait un lieu selon le répertoire courant', () => {
    expect(normalizeDownloadDir('Downloads')).toBeUndefined()
    expect(normalizeDownloadDir('.')).toBeUndefined()
    expect(normalizeDownloadDir('..')).toBeUndefined()
    expect(normalizeDownloadDir(path.join('.', 'Asgard'))).toBeUndefined()
  })
})

describe('chemin proposé à la boîte de dialogue', () => {
  const dir = path.join(path.parse(process.cwd()).root, 'Asgard')

  it('pose le nom dans le dossier réglé', () => {
    expect(saveDefaultPath(dir, 'note.txt')).toBe(path.join(dir, 'note.txt'))
  })

  it('rend le nom seul sans dossier', () => {
    expect(saveDefaultPath(undefined, 'note.txt')).toBe('note.txt')
    expect(saveDefaultPath('', 'note.txt')).toBe('note.txt')
  })

  it('ne laisse pas un nom reçu du réseau sortir du dossier', () => {
    expect(saveDefaultPath(dir, `..${path.sep}..${path.sep}windows${path.sep}system32${path.sep}notepad.exe`)).toBe(
      path.join(dir, 'notepad.exe'),
    )
    expect(saveDefaultPath(dir, '../../../../etc/passwd')).toBe(path.join(dir, 'passwd'))
    expect(saveDefaultPath(dir, `vol${path.sep}dossier${path.sep}note.txt`)).toBe(path.join(dir, 'note.txt'))
  })

  it('se tait sur un nom qui n’en est pas un', () => {
    expect(saveDefaultPath(dir, '')).toBe(dir)
    expect(saveDefaultPath(dir, '.')).toBe(dir)
    expect(saveDefaultPath(dir, '..')).toBe(dir)
    expect(saveDefaultPath(undefined, '')).toBe('')
    expect(saveDefaultPath(dir, undefined)).toBe(dir)
  })
})
