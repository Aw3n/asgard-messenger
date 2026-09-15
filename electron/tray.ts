import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import path from 'path'

interface TrayStrings {
  tooltip: string
  open: string
  quit: string
}

/**
 * I18N : le tray vit dans le process principal, qui n'a pas accès à i18next
 * (module du renderer). Les chaînes du menu natif sont donc intégrées ici
 * dans les 25 langues supportées — formulations alignées sur
 * « onboarding.welcomeDesc » de src/i18n/translations.ts, suffixe
 * « Pear Runtime » retiré pour garder un tooltip court.
 */
const TRAY_STRINGS: Record<string, TrayStrings> = {
  fr: { tooltip: 'Asgard — Messagerie P2P décentralisée', open: 'Ouvrir Asgard', quit: 'Quitter' },
  nl: { tooltip: 'Asgard — Gedecentraliseerde P2P-messenger', open: 'Asgard openen', quit: 'Afsluiten' },
  de: { tooltip: 'Asgard — Dezentraler P2P-Messenger', open: 'Asgard öffnen', quit: 'Beenden' },
  it: { tooltip: 'Asgard — Messenger P2P decentralizzato', open: 'Apri Asgard', quit: 'Esci' },
  es: { tooltip: 'Asgard — Mensajería P2P descentralizada', open: 'Abrir Asgard', quit: 'Salir' },
  pt: { tooltip: 'Asgard — Mensageiro P2P descentralizado', open: 'Abrir Asgard', quit: 'Sair' },
  el: { tooltip: 'Asgard — Αποκεντρωμένος P2P messenger', open: 'Άνοιγμα του Asgard', quit: 'Έξοδος' },
  da: { tooltip: 'Asgard — Decentraliseret P2P-messenger', open: 'Åbn Asgard', quit: 'Afslut' },
  fi: { tooltip: 'Asgard — Hajautettu P2P-pikaviestin', open: 'Avaa Asgard', quit: 'Lopeta' },
  sv: { tooltip: 'Asgard — Decentraliserad P2P-meddelandetjänst', open: 'Öppna Asgard', quit: 'Avsluta' },
  hr: { tooltip: 'Asgard — Decentralizirani P2P messenger', open: 'Otvori Asgard', quit: 'Izlaz' },
  et: { tooltip: 'Asgard — Detsentraliseeritud P2P-sõnumikandja', open: 'Ava Asgard', quit: 'Välju' },
  hu: { tooltip: 'Asgard — Decentralizált P2P üzenetküldő', open: 'Asgard megnyitása', quit: 'Kilépés' },
  lv: { tooltip: 'Asgard — Decentralizēts P2P ziņapmaiņas rīks', open: 'Atvērt Asgard', quit: 'Iziet' },
  lt: { tooltip: 'Asgard — Decentralizuotas P2P pokalbių įrankis', open: 'Atidaryti Asgard', quit: 'Išeiti' },
  mt: { tooltip: 'Asgard — Messenger P2P deċentralizzat', open: 'Iftaħ Asgard', quit: 'Oħroġ' },
  pl: { tooltip: 'Asgard — Zdecentralizowany komunikator P2P', open: 'Otwórz Asgard', quit: 'Zakończ' },
  sk: { tooltip: 'Asgard — Decentralizovaný P2P komunikátor', open: 'Otvoriť Asgard', quit: 'Ukončiť' },
  sl: { tooltip: 'Asgard — Decentralizirani P2P sporočilnik', open: 'Odpri Asgard', quit: 'Končaj' },
  cs: { tooltip: 'Asgard — Decentralizovaný P2P komunikátor', open: 'Otevřít Asgard', quit: 'Ukončit' },
  bg: { tooltip: 'Asgard — Децентрализиран P2P месинджер', open: 'Отвори Asgard', quit: 'Изход' },
  ga: { tooltip: 'Asgard — Teachtaire P2P díláraithe', open: 'Oscail Asgard', quit: 'Scoir' },
  ro: { tooltip: 'Asgard — Mesager P2P descentralizat', open: 'Deschide Asgard', quit: 'Ieși' },
  en: { tooltip: 'Asgard — Decentralized P2P Messenger', open: 'Open Asgard', quit: 'Quit' },
  uk: { tooltip: 'Asgard — Децентралізований P2P-месенджер', open: 'Відкрити Asgard', quit: 'Вийти' },
}

/**
 * AsgardTray — system tray icon and context menu.
 */
export class AsgardTray {
  private tray: Tray | null = null
  private win: BrowserWindow
  private lang: string

  constructor(win: BrowserWindow, lang: string = 'en') {
    this.win = win
    this.lang = lang
    this.create()
  }

  /**
   * Change la langue du menu tray (appelé quand le renderer change de langue).
   * Les codes inconnus conservent la langue courante.
   */
  setLanguage(lang: string): void {
    if (!TRAY_STRINGS[lang]) return
    this.lang = lang
    this.refreshMenu()
  }

  private strings(): TrayStrings {
    return TRAY_STRINGS[this.lang] ?? TRAY_STRINGS.en
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

      // Représentation haute densité. `size` est une taille LOGIQUE : sur un écran
      // Retina (macOS) ou HiDPI, une image de 16 × 16 pixels physiques est agrandie
      // deux fois par le système et rendue floue. Le défaut est inverse de celui
      // de Linux (l'icône était trop petite pour être lisible) : ici elle est
      // correcte en dimensions, mauvaise en définition. Le source fait 1024 px, le
      // 2 × n'est donc qu'un rendu plus fin du même tracé.
      if (process.platform !== 'win32') {
        try {
          const dense = icon.resize({ width: size * 2, height: size * 2 })
          trayIcon.addRepresentation({
            scaleFactor: 2,
            width: size * 2,
            height: size * 2,
            buffer: dense.toBitmap(),
          })
        } catch (err) {
          // Une barre d'état sans icône vaut mieux qu'une application qui ne démarre
          // pas : l'API est récente et le plateau d'un vieux Linux peut la refuser.
          console.warn('[AsgardTray] représentation 2x refusée, icône simple conservée', err)
        }
      }

      this.tray = new Tray(trayIcon)
      this.refreshMenu()

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

  /**
   * (Re)construit le tooltip et le menu contextuel du tray dans la langue
   * courante — appelé à la création et à chaque setLanguage().
   */
  private refreshMenu(): void {
    if (!this.tray) return
    const s = this.strings()

    this.tray.setToolTip(s.tooltip)

    const contextMenu = Menu.buildFromTemplate([
      {
        label: s.open,
        click: () => {
          this.win.show()
          this.win.focus()
        },
      },
      { type: 'separator' },
      {
        label: s.quit,
        click: () => {
          app.isQuitting = true
          app.quit()
        },
      },
    ])

    this.tray.setContextMenu(contextMenu)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
