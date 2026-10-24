import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import path from 'path'
import { paintUnreadDot, UNREAD_DOT_SIZE } from './utils/unreadDot'
import { createTrayActivation, type TrayActivation } from './utils/trayActivation'

interface TrayStrings {
  tooltip: string
  open: string
  quit: string
  /** Description lue par les lecteurs d'écran pour la superposition de la barre des tâches. */
  unread: string
}

/**
 * I18N : le tray vit dans le process principal, qui n'a pas accès à i18next
 * (module du renderer). Les chaînes du menu natif sont donc intégrées ici
 * dans les 25 langues supportées — formulations alignées sur
 * « onboarding.welcomeDesc » de src/i18n/translations.ts, suffixe
 * « Pear Runtime » retiré pour garder un tooltip court.
 */
const TRAY_STRINGS: Record<string, TrayStrings> = {
  fr: { tooltip: 'Asgard — Messagerie P2P décentralisée', open: 'Ouvrir Asgard', quit: 'Quitter', unread: 'Nouveaux messages' },
  nl: { tooltip: 'Asgard — Gedecentraliseerde P2P-messenger', open: 'Asgard openen', quit: 'Afsluiten', unread: 'Nieuwe berichten' },
  de: { tooltip: 'Asgard — Dezentraler P2P-Messenger', open: 'Asgard öffnen', quit: 'Beenden', unread: 'Neue Nachrichten' },
  it: { tooltip: 'Asgard — Messenger P2P decentralizzato', open: 'Apri Asgard', quit: 'Esci', unread: 'Nuovi messaggi' },
  es: { tooltip: 'Asgard — Mensajería P2P descentralizada', open: 'Abrir Asgard', quit: 'Salir', unread: 'Mensajes nuevos' },
  pt: { tooltip: 'Asgard — Mensageiro P2P descentralizado', open: 'Abrir Asgard', quit: 'Sair', unread: 'Novas mensagens' },
  el: { tooltip: 'Asgard — Αποκεντρωμένος P2P messenger', open: 'Άνοιγμα του Asgard', quit: 'Έξοδος', unread: 'Νέα μηνύματα' },
  da: { tooltip: 'Asgard — Decentraliseret P2P-messenger', open: 'Åbn Asgard', quit: 'Afslut', unread: 'Nye beskeder' },
  fi: { tooltip: 'Asgard — Hajautettu P2P-pikaviestin', open: 'Avaa Asgard', quit: 'Lopeta', unread: 'Uudet viestit' },
  sv: { tooltip: 'Asgard — Decentraliserad P2P-meddelandetjänst', open: 'Öppna Asgard', quit: 'Avsluta', unread: 'Nya meddelanden' },
  hr: { tooltip: 'Asgard — Decentralizirani P2P messenger', open: 'Otvori Asgard', quit: 'Izlaz', unread: 'Nove poruke' },
  et: { tooltip: 'Asgard — Detsentraliseeritud P2P-sõnumikandja', open: 'Ava Asgard', quit: 'Välju', unread: 'Uued sõnumid' },
  hu: { tooltip: 'Asgard — Decentralizált P2P üzenetküldő', open: 'Asgard megnyitása', quit: 'Kilépés', unread: 'Új üzenetek' },
  lv: { tooltip: 'Asgard — Decentralizēts P2P ziņapmaiņas rīks', open: 'Atvērt Asgard', quit: 'Iziet', unread: 'Jaunas ziņas' },
  lt: { tooltip: 'Asgard — Decentralizuotas P2P pokalbių įrankis', open: 'Atidaryti Asgard', quit: 'Išeiti', unread: 'Naujos žinutės' },
  mt: { tooltip: 'Asgard — Messenger P2P deċentralizzat', open: 'Iftaħ Asgard', quit: 'Oħroġ', unread: 'Messaġġi ġodda' },
  pl: { tooltip: 'Asgard — Zdecentralizowany komunikator P2P', open: 'Otwórz Asgard', quit: 'Zakończ', unread: 'Nowe wiadomości' },
  sk: { tooltip: 'Asgard — Decentralizovaný P2P komunikátor', open: 'Otvoriť Asgard', quit: 'Ukončiť', unread: 'Nové správy' },
  sl: { tooltip: 'Asgard — Decentralizirani P2P sporočilnik', open: 'Odpri Asgard', quit: 'Končaj', unread: 'Nova sporočila' },
  cs: { tooltip: 'Asgard — Decentralizovaný P2P komunikátor', open: 'Otevřít Asgard', quit: 'Ukončit', unread: 'Nové zprávy' },
  bg: { tooltip: 'Asgard — Децентрализиран P2P месинджер', open: 'Отвори Asgard', quit: 'Изход', unread: 'Нови съобщения' },
  ga: { tooltip: 'Asgard — Teachtaire P2P díláraithe', open: 'Oscail Asgard', quit: 'Scoir', unread: 'Teachtaireachtaí nua' },
  ro: { tooltip: 'Asgard — Mesager P2P descentralizat', open: 'Deschide Asgard', quit: 'Ieși', unread: 'Mesaje noi' },
  en: { tooltip: 'Asgard — Decentralized P2P Messenger', open: 'Open Asgard', quit: 'Quit', unread: 'New messages' },
  uk: { tooltip: 'Asgard — Децентралізований P2P-месенджер', open: 'Відкрити Asgard', quit: 'Вийти', unread: 'Нові повідомлення' },
}

/**
 * AsgardTray — system tray icon and context menu.
 */
export class AsgardTray {
  private tray: Tray | null = null
  private win: BrowserWindow
  private lang: string
  private unread = 0
  private overlayIcon: NativeImage | null = null
  private activation: TrayActivation | null = null
  private static readonly MAX_TOOLTIP_UNREAD = 99

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

  /**
   * Total des non-lus reflété dans le tooltip, sur l'icône de la barre des
   * tâches (Windows) et sur le badge du Dock (macOS). La fenêtre masquée dans
   * le tray n'apparaît ni dans la barre des tâches ni dans Alt+Tab : sans cela,
   * un message reçu ne produisait aucun signe visible.
   */
  setUnread(count: number): void {
    const next = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    if (next === this.unread) return
    this.unread = next
    this.applyUnreadIndicators()
  }

  private unreadLabel(): string {
    return this.unread > AsgardTray.MAX_TOOLTIP_UNREAD
      ? `${AsgardTray.MAX_TOOLTIP_UNREAD}+`
      : String(this.unread)
  }

  private applyUnreadIndicators(): void {
    this.applyTooltip()
    this.applyTaskbarOverlay()
    this.applyDockBadge()
  }

  private applyTooltip(): void {
    if (!this.tray) return
    const base = this.strings().tooltip
    if (this.unread <= 0) {
      this.tray.setToolTip(base)
      return
    }
    this.tray.setToolTip(`(${this.unreadLabel()}) ${base}`)
  }

  /**
   * Windows superpose une pastille à l'icône de la barre des tâches. Une image
   * native est construite une fois par session ; la description localisée est
   * ce que lit Narrator.
   */
  private applyTaskbarOverlay(): void {
    if (process.platform !== 'win32') return
    if (!this.win || this.win.isDestroyed()) return
    if (this.unread <= 0) {
      this.win.setOverlayIcon(null, '')
      return
    }
    if (!this.overlayIcon) {
      this.overlayIcon = nativeImage.createFromBitmap(paintUnreadDot(), {
        width: UNREAD_DOT_SIZE,
        height: UNREAD_DOT_SIZE,
      })
    }
    this.win.setOverlayIcon(this.overlayIcon, this.strings().unread)
  }

  /** macOS affiche le compte sur le badge du Dock, comme les autres messageries. */
  private applyDockBadge(): void {
    if (process.platform !== 'darwin' || !app.dock) return
    app.dock.setBadge(this.unread > 0 ? this.unreadLabel() : '')
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

      // Windows n'activait l'icône qu'au double-clic alors que le geste attendu
      // sur cette plateforme est le clic simple ; l'arbitre évite le
      // clignotement d'une bascule par clic lors d'un double-clic. Sur macOS,
      // le clic gauche ouvre le menu contextuel natif : on n'y touche pas.
      if (process.platform === 'win32') {
        this.activation = createTrayActivation(() => this.toggleWindow())
        this.tray.on('click', this.activation.click)
        this.tray.on('double-click', this.activation.doubleClick)
      } else {
        this.tray.on('double-click', () => this.toggleWindow())
      }
    } catch (err) {
      console.warn('[AsgardTray] Could not create tray:', err)
    }
  }

  /** Ramène la fenêtre devant, ou la range dans le tray si elle est déjà là. */
  private toggleWindow(): void {
    if (this.win.isDestroyed()) return
    if (this.win.isVisible()) {
      this.win.hide()
    } else {
      this.win.show()
      this.win.focus()
    }
  }

  /**
   * (Re)construit le tooltip et le menu contextuel du tray dans la langue
   * courante — appelé à la création et à chaque setLanguage().
   */
  private refreshMenu(): void {
    if (!this.tray) return
    const s = this.strings()

    this.applyUnreadIndicators()

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
    this.activation?.cancel()
    this.activation = null
    this.tray?.destroy()
    this.tray = null
  }
}
