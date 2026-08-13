import { app, BrowserWindow, Menu, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { setupIpcHandlers } from './ipc/handlers'
import { AsgardTray } from './tray'

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')

// ── File-based logging for diagnostics ──
// Redirects console.log to a log file so we can diagnose issues in production.
const logDir = path.join(app.getPath('userData'), 'logs')
try { fs.mkdirSync(logDir, { recursive: true }) } catch {}
const logFile = path.join(logDir, 'asgard.log')
// Clear log on each start
try { fs.writeFileSync(logFile, `=== Asgard log started ${new Date().toISOString()} ===\n`) } catch {}
const _origLog = console.log
const _origErr = console.error
const _origWarn = console.warn
console.log = (...args: unknown[]) => {
  _origLog(...args)
  try { fs.appendFileSync(logFile, '[LOG] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n') } catch {}
}
console.error = (...args: unknown[]) => {
  _origErr(...args)
  try { fs.appendFileSync(logFile, '[ERR] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n') } catch {}
}
console.warn = (...args: unknown[]) => {
  _origWarn(...args)
  try { fs.appendFileSync(logFile, '[WRN] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n') } catch {}
}

// In CommonJS (Electron), __dirname is natively available
const projectRoot = isDev
  ? path.resolve(__dirname, '..', '..')
  : app.getAppPath()

let mainWindow: BrowserWindow | null = null
let tray: AsgardTray | null = null

/**
 * Get platform-specific BrowserWindow options.
 * - Windows: hidden title bar + native overlay controls (Mica/Fluent)
 * - macOS: hiddenInset to leave space for traffic lights
 * - Linux: hidden title bar with custom controls in React TitleBar
 */
function getWindowOptions(): Partial<Electron.BrowserWindowConstructorOptions> {
  const base = {
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0B0E1A',
    webPreferences: {
      preload: path.join(projectRoot, 'dist', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: false,
      // DevTools are removed from the app: the inspector cannot be opened at
      // all, in development as in production.
      devTools: false,
    },
    roundedCorners: true,
    show: false,
  } as Electron.BrowserWindowConstructorOptions

  if (process.platform === 'win32') {
    return {
      ...base,
      // titleBarStyle hidden + overlay: native Windows controls on right,
      // our React TitleBar fills the left draggable area
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#0B0E1A',
        symbolColor: '#8A9BBF',
        height: 38,
      },
      icon: path.join(projectRoot, 'assets', 'icon.ico'),
    }
  }

  if (process.platform === 'darwin') {
    return {
      ...base,
      // hiddenInset leaves space for macOS traffic lights on the left
      titleBarStyle: 'hiddenInset',
      titleBarOverlay: false,
      icon: path.join(projectRoot, 'assets', 'icon.icns'),
      // Disable rounded corners on older macOS; Electron handles modern ones
      roundedCorners: true,
    }
  }

  // Linux and other Unix-likes
  return {
    ...base,
    // Frameless with custom React controls (no native overlay on Linux)
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    icon: path.join(projectRoot, 'assets', 'asgard-icon.png'),
    // Some Linux compositors don't support rounded corners reliably
    roundedCorners: true,
  }
}

/**
 * Creates the main application window with platform-specific title bar styling.
 * Does NOT load content - call loadContent() separately after IPC handlers are registered.
 */
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow(getWindowOptions())

  // Enable Mica effect on Windows 11
  if (process.platform === 'win32') {
    try {
      mainWindow.setBackgroundMaterial('mica')
    } catch {
      mainWindow.setBackgroundColor('#0B0E1A')
    }
  }

  // Show window when ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Prevent navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isDev && !url.startsWith('file://')) {
      event.preventDefault()
    }
  })

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle minimize to tray
  mainWindow.on('close', (event) => {
    if (tray && !app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
}

/**
 * Load content into the main window after IPC handlers are registered.
 */
async function loadContent(): Promise<void> {
  if (!mainWindow) return

  // Always load from built files — works in both dev and production
  // For live dev with hot-reload, run: npm run dev:vite separately
  const htmlPath = path.join(projectRoot, 'dist', 'renderer', 'index.html')
  console.log('[Main] Loading renderer from:', htmlPath)

  try {
    await mainWindow.loadFile(htmlPath)
    console.log('[Main] Renderer loaded successfully')
  } catch (err) {
    console.error('[Main] Failed to load renderer:', err)
    // Retry once after 500ms
    await new Promise(r => setTimeout(r, 500))
    try {
      await mainWindow.loadFile(htmlPath)
    } catch (err2) {
      console.error('[Main] Retry also failed:', err2)
    }
  }
}

/**
 * App initialization
 */
async function initialize(): Promise<void> {
  // Ensure single instance
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
    return
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      mainWindow.show()
    }
  })

  await app.whenReady()

  // Set app metadata
  app.setAppUserModelId('com.asgard.messenger')
  app.setName('Asgard')

  // Drop the default Electron menu: it is invisible (the title bar is hidden)
  // but still binds the "Toggle Developer Tools" accelerator. macOS keeps its
  // menu, which the system needs for the standard edit shortcuts.
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  // Create window (but don't load content yet)
  await createWindow()

  // CRITICAL: Setup IPC handlers BEFORE loading content
  // This ensures all handlers are registered before the renderer starts executing
  console.log('[Main] Setting up IPC handlers...')
  await setupIpcHandlers(mainWindow!)
  console.log('[Main] IPC handlers setup complete')

  // NOW load content after handlers are registered
  await loadContent()

  // Create system tray
  tray = new AsgardTray(mainWindow!)

  // macOS dock handling
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Recreate window and reload content
      await createWindow()
      await loadContent()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
})

// Security: prevent creation of new windows
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Swallow the DevTools keystrokes before Chromium sees them. devTools:false
  // already blocks the inspector; this closes the accelerator path too.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    const mod = input.control || input.meta
    if (key === 'f12' || (mod && input.shift && (key === 'i' || key === 'j' || key === 'c'))) {
      event.preventDefault()
    }
  })
})

// Initialize application
initialize().catch(console.error)

// Extend app type for isQuitting flag
declare global {
  namespace Electron {
    interface App {
      isQuitting: boolean
    }
  }
}
