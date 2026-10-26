import { beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import type { BrowserWindow } from 'electron'

const state = vi.hoisted(() => ({
  appPath: '',
  iconMissing: false,
  requested: [] as string[],
}))

vi.mock('electron', () => {
  class MockTray {
    on(): void {}
    setContextMenu(): void {}
    setToolTip(): void {}
    destroy(): void {}
  }

  return {
    app: {
      getAppPath: () => state.appPath,
      isQuitting: false,
      quit: () => {},
      dock: undefined,
    },
    BrowserWindow: class {},
    Menu: { buildFromTemplate: () => ({}) },
    Tray: MockTray,
    nativeImage: {
      createFromPath: (p: string) => {
        state.requested.push(p)
        return {
          isEmpty: () => state.iconMissing,
          resize: () => ({ addRepresentation: () => {} }),
        }
      },
      createFromBitmap: () => ({}),
    },
  }
})

import { AsgardTray } from '../../electron/tray'

const fakeWindow = () => ({
  isDestroyed: () => false,
  isVisible: () => true,
  setOverlayIcon: () => {},
  show: () => {},
  hide: () => {},
  focus: () => {},
}) as unknown as BrowserWindow

describe('icône du tray, résolue depuis la racine de l’application', () => {
  beforeEach(() => {
    state.appPath = ''
    state.iconMissing = false
    state.requested.length = 0
  })

  it('en dev, la racine est celle du projet — pas son dossier parent', () => {
    // `electron .` fait pointer app.getAppPath() sur le projet : l'icône doit
    // être cherchée dans son dossier assets, sans remonter au-delà.
    state.appPath = process.cwd()

    const tray = new AsgardTray(fakeWindow(), 'fr')

    expect(state.requested).toEqual([path.join(process.cwd(), 'assets', 'asgard-icon.png')])
    expect(tray.available).toBe(true)
  })

  it('dans l’asar, les assets sont copiés à la racine de l’application', () => {
    state.appPath = path.join('/opt/Asgard/resources/app.asar')

    new AsgardTray(fakeWindow(), 'fr')

    expect(state.requested).toEqual([
      path.join('/opt/Asgard/resources/app.asar', 'assets', 'asgard-icon.png'),
    ])
  })

  it('sans icône, aucune barre d’état ne prétend exister', () => {
    // La fenêtre ne doit pas pouvoir être masquée « au tray » quand il n'y a
    // pas d'icône pour la rouvrir.
    state.appPath = path.join('/opt/Asgard/resources/app.asar')
    state.iconMissing = true

    const tray = new AsgardTray(fakeWindow(), 'fr')

    expect(tray.available).toBe(false)
  })
})
