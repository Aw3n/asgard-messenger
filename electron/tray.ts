import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import path from 'path'

/**
 * AsgardTray — system tray icon and context menu.
 */
export class AsgardTray {
  private tray: Tray | null = null
  private win: BrowserWindow

  constructor(win: BrowserWindow) {
    this.win = win
    this.create()
  }

  private create(): void {
    try {
      // Load the app icon from assets — works in both dev and packaged (asar) modes
      const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')
      const projectRoot = isDev
        ? path.resolve(app.getAppPath(), '..', '..')
        : app.getAppPath()
      const iconPath = path.join(projectRoot, 'assets', 'asgard-icon.png')
      const icon = nativeImage.createFromPath(iconPath)
      if (icon.isEmpty()) {
        console.warn('[AsgardTray] Icon missing at', iconPath)
        return
      }
      // Linux status notifiers typically want 22-24px; 16px looks blank.
      const size = process.platform === 'linux' ? 24 : 16
      const trayIcon = icon.resize({ width: size, height: size })

      this.tray = new Tray(trayIcon)
      this.tray.setToolTip('Asgard — Decentralized Messenger')

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Open Asgard',
          click: () => {
            this.win.show()
            this.win.focus()
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            app.isQuitting = true
            app.quit()
          },
        },
      ])

      this.tray.setContextMenu(contextMenu)

      this.tray.on('double-click', () => {
        if (this.win.isVisible()) {
          this.win.hide()
        } else {
          this.win.show()
          this.win.focus()
        }
      })
    } catch (err) {
      console.warn('[AsgardTray] Could not create tray:', err)
    }
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
