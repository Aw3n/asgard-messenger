import { app, BrowserWindow, Menu, shell, globalShortcut, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { setupIpcHandlers, setPendingDeepLink } from './ipc/handlers'
import { AsgardTray } from './tray'
import { configureFirewall } from './services/FirewallService'

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')

/**
 * DevTools — réservés au développement (`npm run dev`).
 *
 * Ils étaient ouverts par trois portes dans le paquet livré : `devTools: true`
 * dans les préférences, l'ouverture automatique à la fin du chargement du
 * renderer, et le raccourci F12 / Ctrl+Shift+I. Une messagerie chiffrée dont la
 * fenêtre affiche contacts, messages et clefs publiques ne doit pas offrir sa
 * console à quiconque ouvre l'application puis appuie sur F12.
 *
 * Le diagnostic d'une version installée passe par les journaux sur disque
 * (`logs/asgard.log`, `network.log`), écrits par `console.log` détourné plus
 * bas — cette voie-là reste ouverte, elle ne montre que ce qu'on veut bien y
 * mettre et ne permet ni d'exécuter du code, ni de lire le store.
 *
 * `!app.isPackaged` n'est pas un doublon de `isDev` : `isDev` lit
 * `NODE_ENV`, une variable d'environnement qui appartient à la machine de
 * celui qui lance le processus. Un poste réglé sur `NODE_ENV=development`
 * rouvrirait donc la console du paquet livré — celui qu'on installe chez un
 * tiers, pas celui qu'on construit. `app.isPackaged` vient du paquet lui-même
 * et ne se règle pas de l'extérieur.
 */
const devToolsAllowed = isDev && !app.isPackaged

// Linux: Chromium's SUID sandbox (chrome-sandbox) is almost never
// correctly configured in AppImage / user-installed .deb / tar.gz.
// Without these switches the process exits immediately with:
// "The SUID sandbox helper binary was found, but is not configured correctly."
// Ozone auto-selects Wayland or X11 so the window actually appears.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-setuid-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('gtk-version', '3')
}

// PRÉSENCE BIDIRECTIONNELLE: Asgard tient sa présence en vie depuis le
// renderer (intervalle de 5 s du heartbeat ChatService, re-publication du
// statut DHT toutes les 30 s, rafraîchissement des profils toutes les 60 s).
// Or Chromium applique le « timer throttling » et le « backgrounding » aux
// pages masquées/minimées: après ~5 min, les setInterval sont ramenés à ~1/min.
// Une fenêtre réduite dans la tray (le cas normal d'un client de messagerie)
// cessait donc d'émettre sa présence: le contact nous voyait passer « hors
// ligne » (et inversement, on ne rafraîchissait plus son statut), alors que la
// connexion Noise restait ouverte — exactement le « ghost online » des logs.
// Ces switches désactivent la throttling pour que l'app reste temps réel.
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')


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

// ── Filet de sécurité sur les exceptions du process principal ───────────────
// Une exception non rattrapée dans le process principal tue l'app et affiche la
// boîte « A JavaScript error occurred in the main process ». Or les erreurs de
// cycle de vie Electron (« Object has been destroyed ») sont des RACES de
// fermeture sans conséquence : un timer réseau qui émet après la destruction de
// la fenêtre, pendant que `quitCleanups` attend encore le DHT. Les rendre
// silencieuses (elles sont journalisées) évite le message d'erreur reçu par
// l'utilisateur en quittant l'application. TOUTE autre exception reste reportée
// à l'utilisateur tel quel : rien n'est masqué par ici.
const LIFECYCLE_RACE = /object has been destroyed|has been destroyed|target window .{0,24}(?:closed|destroyed|not (?:available|found))|renderer process .{0,10}(?:gone|exited|terminated)|window has been closed|frame .{0,20}(?:detached|destroyed)/i

// Seconde famille de races de fermeture, du côté du transport cette fois :
// Hyperswarm détruit ses streams puis draine sa file de re-connexion dans les
// mêmes handlers `close`. Le drapeau `suspended` posé par
// `NetworkService.quiesceSwarm()` ferme la fenêtre connue ; mais une exception
// dont la stack ne traverse QUE des modules holepunch, pendant que l'app quitte,
// reste une course interne à une librairie tierce — elle naît dans un `nextTick`
// de destruction, hors de portée de notre code. Elle est journalisée
// intégralement (asgard.log) au lieu d'être affichée. HORS fermeture, une telle
// exception est toujours reportée : ce second filet ne masque rien en session.
const TRANSPORT_SHUTDOWN_RACE = /node_modules[\\/](?:@hyperswarm[\\/]|hyperswarm[\\/]|hyperdht[\\/]|shuffled-priority-queue[\\/]|unordered-set[\\/]|sodium-(?:native|universal)[\\/])/i

process.on('uncaughtException', (err) => {
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err)
  console.error('[Main] Uncaught exception:', stack)
  try { fs.appendFileSync(logFile, stack + '\n') } catch {}
  if (LIFECYCLE_RACE.test(stack)) {
    console.warn('[Main] Exception de cycle de vie ignorée (fenêtre/objet détruit en cours de fermeture)')
    return
  }
  if (app.isQuitting === true && TRANSPORT_SHUTDOWN_RACE.test(stack)) {
    console.warn('[Main] Course de destruction du réseau ignorée (transport tiers en cours de fermeture)')
    return
  }
  // Comportement par défaut d'Electron, reproduit explicitement : même boîte
  // d'information, mais avec la stack complète déjà écrite dans asgard.log.
  try {
    dialog.showErrorBox('A JavaScript error occurred in the main process', stack)
  } catch {
    /* dialog indisponible (avant app.ready) : le log fait foi */
  }
})

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
      // CONNECTIVITÉ: ne pas geler le renderer quand la fenêtre est masquée
      // (réduite dans la tray) — la publication de présence en dépend.
      // Complète les switches disable-*-backgrounding ci-dessus.
      backgroundThrottling: false,
      // faux dans le paquet livré : ferme aussi la commande `openDevTools()`
      // et l'inspecteur, pas seulement les raccourcis clavier
      devTools: devToolsAllowed,
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

  // Linux: titleBarStyle:'hidden' is ignored by most GTK/WMs.
  // frame:false + custom TitleBar controls.
  return {
    ...base,
    frame: false,
    titleBarOverlay: false,
    icon: path.join(projectRoot, 'assets', 'asgard-icon.png'),
    roundedCorners: false,
    transparent: false,
    autoHideMenuBar: true,
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
 * Menu applicatif.
 *
 * Windows et Linux : aucun (la barre de titre est masquée, le menu d'Electron
 * est invisible mais lie tout de même l'accélérateur « Toggle Developer Tools »).
 *
 * macOS : `setApplicationMenu(null)` est interdit là — le système a besoin de
 * ses rôles standards (copier/coller dans la zone de message, Cmd+Q). Sans lui,
 * on hérite du menu PAR DÉFAUT d'Electron, qui contient « View → Toggle
 * Developer Tools » (Cmd+Opt+I), « Force Reload » et un accélérateur de zoom :
 * une quatrième porte vers la console, plus large que F12 puisqu'elle se
 * clique à la souris. D'où un menu construit à la main, sans « View ».
 * Les rôles `appMenu`/`editMenu`/`windowMenu` ne référencent jamais DevTools.
 */
function installApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]
  if (devToolsAllowed) {
    // « View » n'existe qu'en développement, et c'est le seul endroit du
    // produit d'où la console est atteignable sur macOS
    template.splice(2, 0, {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }],
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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
    // en développement seulement : avant, la fenêtre se détachait chez tout
    // le monde à chaque lancement de la version installée
    if (devToolsAllowed) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
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

  // ── Deep link protocol (asgard://invite/…) ──
  // Les liens d'invitation générés par ContactInviteModal doivent ouvrir
  // l'application : mimeTypes Linux (.desktop), build.protocols → Info.plist
  // macOS, registre Windows via setAsDefaultProtocolClient.
  if (process.platform !== 'darwin') {
    // Pattern officiel Electron (doc Deep Links) : en dev (electron .),
    // l'enregistrement doit pointer vers l'entry de l'app ; packagé,
    // l'exécutable suffit. macOS passe par Info.plist (build.protocols).
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('asgard', process.execPath, [path.resolve(process.argv[1])])
    } else {
      app.setAsDefaultProtocolClient('asgard')
    }
  }

  const forwardDeepLink = (url: string | undefined): void => {
    if (!url || !url.startsWith('asgard://')) return
    console.log('[Main] Deep link received:', url)
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.webContents.send('app:deepLink', url)
    } else {
      // Fenêtre pas encore créée (démarrage à froid) : mise en attente pour le
      // pull app:getPendingDeepLink du renderer au montage.
      setPendingDeepLink(url)
    }
  }

  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      mainWindow.show()
    }
    // Windows/Linux : un lien asgard:// cliqué pendant que l'app tourne arrive
    // dans l'argv de la seconde instance.
    forwardDeepLink(argv.find((a) => a.startsWith('asgard://')))
  })

  // Démarrage à froid : l'app a été lancée PAR le lien — il est dans argv.
  forwardDeepLink(process.argv.find((a) => a.startsWith('asgard://')))

  // macOS : le lien est livré via 'open-url' (pas de seconde instance).
  app.on('open-url', (event, url) => {
    event.preventDefault()
    forwardDeepLink(url)
  })

  await app.whenReady()

  // Set app metadata
  app.setAppUserModelId('com.asgard.messenger')
  app.setName('Asgard')

  // Drop the default Electron menu — voir installApplicationMenu() pour le
  // pourquoi, notamment sur macOS où le menu par défaut offre la console.
  installApplicationMenu()

  // Create window (but don't load content yet)
  await createWindow()

  // Create the system tray BEFORE registering IPC handlers — the
  // 'ui:setLanguage' handler needs it to localize the native tray menu.
  tray = new AsgardTray(mainWindow!)

  // CRITICAL: Setup IPC handlers BEFORE loading content
  // This ensures all handlers are registered before the renderer starts executing
  console.log('[Main] Setting up IPC handlers...')
  await setupIpcHandlers(mainWindow!, tray)
  console.log('[Main] IPC handlers setup complete')

  // NOW load content after handlers are registered
  await loadContent()

  // Configure Windows Firewall for P2P connections (runs once on first launch)
  // This is non-blocking — will silently fail if admin rights are not available
  configureFirewall()

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

  // Raccourcis DevTools : neutralisés dans le paquet livré, conservés en dev.
  // `preventDefault` est appelé dans les deux cas — sans ça, Chromium garde
  // son accélérateur interne et F12 rouvrirait la console quand même.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    const mod = input.control || input.meta
    const isDevToolsShortcut =
      key === 'f12' ||
      (mod && input.shift && (key === 'i' || key === 'j' || key === 'c'))
    if (!isDevToolsShortcut) return
    event.preventDefault()
    if (!devToolsAllowed) return
    if (contents.isDevToolsOpened()) contents.closeDevTools()
    else contents.openDevTools({ mode: 'detach' })
  })
})

// Initialize application
initialize().catch(console.error)

// Extend app type for isQuitting flag
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- module augmentation of Electron's App interface requires a namespace
  namespace Electron {
    interface App {
      isQuitting: boolean
    }
  }
}
