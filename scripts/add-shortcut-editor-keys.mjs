#!/usr/bin/env node
/**
 * Adds the 19 keys of the keyboard-shortcut editor to all 25 supported
 * languages of src/i18n/translations.ts.
 *
 * Why these words : settings.keyboardShortcuts held fifteen combos that the
 * code had been reading for several lots, while the a11y row already promised
 * « Afficher les raccourcis clavier » — there was nothing to display. The
 * editor therefore has to say three things plainly: which gesture an action
 * answers to, that pressing here captures the key instead of running the
 * action, and why a refused combination is refused (already taken, or Tab,
 * which carries focus through the whole interface).
 *
 * Same in-place algorithm as add-delete-confirm-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'settings.shortcuts',
  'settings.shortcutsSubtitle',
  'settings.shortcutsComposer',
  'settings.shortcutsGlobal',
  'settings.shortcutsOnMessage',
  'settings.shortcutNewLine',
  'settings.shortcutToggleSidebar',
  'settings.shortcutNextConversation',
  'settings.shortcutPrevConversation',
  'settings.shortcutOpenSettings',
  'settings.shortcutOpenProfile',
  'settings.shortcutFocusInput',
  'settings.shortcutListening',
  'settings.shortcutDisabled',
  'settings.shortcutClear',
  'settings.shortcutReset',
  'settings.shortcutTaken',
  'settings.shortcutReserved',
  'settings.shortcutsResetAll',
]

const DATA = {
  fr: {
    'settings.shortcuts': 'Raccourcis clavier',
    'settings.shortcutsSubtitle': 'Cliquez sur un geste, puis appuyez la combinaison voulue. Échap annule la saisie.',
    'settings.shortcutsComposer': 'Dans la zone de message',
    'settings.shortcutsGlobal': 'Dans l’application',
    'settings.shortcutsOnMessage': 'Sur un message',
    'settings.shortcutNewLine': 'Insérer un saut de ligne',
    'settings.shortcutToggleSidebar': 'Afficher ou masquer la barre latérale',
    'settings.shortcutNextConversation': 'Conversation suivante',
    'settings.shortcutPrevConversation': 'Conversation précédente',
    'settings.shortcutOpenSettings': 'Ouvrir les réglages',
    'settings.shortcutOpenProfile': 'Ouvrir mon profil',
    'settings.shortcutFocusInput': 'Écrire un message',
    'settings.shortcutListening': 'Appuyez une combinaison…',
    'settings.shortcutDisabled': 'Désactivé',
    'settings.shortcutClear': 'Désactiver ce geste',
    'settings.shortcutReset': 'Rétablir la combinaison par défaut',
    'settings.shortcutTaken': 'Déjà réglée sur « {{action}} ».',
    'settings.shortcutReserved': 'Réservée : cette touche mène le focus dans l’application.',
    'settings.shortcutsResetAll': 'Rétablir tous les gestes',
  },
  nl: {
    'settings.shortcuts': 'Sneltoetsen',
    'settings.shortcutsSubtitle': 'Klik op een handeling en druk de gewenste combinatie. Esc breekt af.',
    'settings.shortcutsComposer': 'In het tekstvak',
    'settings.shortcutsGlobal': 'In de toepassing',
    'settings.shortcutsOnMessage': 'Op een bericht',
    'settings.shortcutNewLine': 'Regeleinde invoegen',
    'settings.shortcutToggleSidebar': 'Zijbalk tonen of verbergen',
    'settings.shortcutNextConversation': 'Volgend gesprek',
    'settings.shortcutPrevConversation': 'Vorig gesprek',
    'settings.shortcutOpenSettings': 'Instellingen openen',
    'settings.shortcutOpenProfile': 'Mijn profiel openen',
    'settings.shortcutFocusInput': 'Bericht schrijven',
    'settings.shortcutListening': 'Druk een combinatie…',
    'settings.shortcutDisabled': 'Uitgeschakeld',
    'settings.shortcutClear': 'Deze handeling uitschakelen',
    'settings.shortcutReset': 'Standaardcombinatie herstellen',
    'settings.shortcutTaken': 'Al toegewezen aan “{{action}}”.',
    'settings.shortcutReserved': 'Gereserveerd: deze toets stuurt de focus door de toepassing.',
    'settings.shortcutsResetAll': 'Alle handelingen herstellen',
  },
  de: {
    'settings.shortcuts': 'Tastenkombinationen',
    'settings.shortcutsSubtitle': 'Klicken Sie auf eine Aktion und drücken Sie die gewünschte Kombination. Esc bricht ab.',
    'settings.shortcutsComposer': 'Im Eingabefeld',
    'settings.shortcutsGlobal': 'In der App',
    'settings.shortcutsOnMessage': 'An einer Nachricht',
    'settings.shortcutNewLine': 'Zeilenumbruch einfügen',
    'settings.shortcutToggleSidebar': 'Seitenleiste ein- oder ausblenden',
    'settings.shortcutNextConversation': 'Nächste Unterhaltung',
    'settings.shortcutPrevConversation': 'Vorherige Unterhaltung',
    'settings.shortcutOpenSettings': 'Einstellungen öffnen',
    'settings.shortcutOpenProfile': 'Mein Profil öffnen',
    'settings.shortcutFocusInput': 'Nachricht schreiben',
    'settings.shortcutListening': 'Kombination drücken…',
    'settings.shortcutDisabled': 'Deaktiviert',
    'settings.shortcutClear': 'Diese Aktion deaktivieren',
    'settings.shortcutReset': 'Standardkombination wiederherstellen',
    'settings.shortcutTaken': 'Bereits „{{action}}“ zugewiesen.',
    'settings.shortcutReserved': 'Reserviert: Diese Taste steuert den Fokus durch die App.',
    'settings.shortcutsResetAll': 'Alle Aktionen zurücksetzen',
  },
  it: {
    'settings.shortcuts': 'Scorciatoie da tastiera',
    'settings.shortcutsSubtitle': 'Fai clic su un’azione e premi la combinazione desiderata. Esc annulla.',
    'settings.shortcutsComposer': 'Nella casella di testo',
    'settings.shortcutsGlobal': 'Nell’app',
    'settings.shortcutsOnMessage': 'Su un messaggio',
    'settings.shortcutNewLine': 'Inserisci a capo',
    'settings.shortcutToggleSidebar': 'Mostra o nascondi la barra laterale',
    'settings.shortcutNextConversation': 'Conversazione successiva',
    'settings.shortcutPrevConversation': 'Conversazione precedente',
    'settings.shortcutOpenSettings': 'Apri le impostazioni',
    'settings.shortcutOpenProfile': 'Apri il mio profilo',
    'settings.shortcutFocusInput': 'Scrivi un messaggio',
    'settings.shortcutListening': 'Premi una combinazione…',
    'settings.shortcutDisabled': 'Disattivata',
    'settings.shortcutClear': 'Disattiva questa azione',
    'settings.shortcutReset': 'Ripristina la combinazione predefinita',
    'settings.shortcutTaken': 'Già assegnata a “{{action}}”.',
    'settings.shortcutReserved': 'Riservata: questo tasto sposta il focus nell’app.',
    'settings.shortcutsResetAll': 'Ripristina tutte le azioni',
  },
  es: {
    'settings.shortcuts': 'Atajos de teclado',
    'settings.shortcutsSubtitle': 'Haz clic en una acción y pulsa la combinación deseada. Esc cancela.',
    'settings.shortcutsComposer': 'En el campo de mensaje',
    'settings.shortcutsGlobal': 'En la aplicación',
    'settings.shortcutsOnMessage': 'En un mensaje',
    'settings.shortcutNewLine': 'Insertar salto de línea',
    'settings.shortcutToggleSidebar': 'Mostrar u ocultar la barra lateral',
    'settings.shortcutNextConversation': 'Conversación siguiente',
    'settings.shortcutPrevConversation': 'Conversación anterior',
    'settings.shortcutOpenSettings': 'Abrir los ajustes',
    'settings.shortcutOpenProfile': 'Abrir mi perfil',
    'settings.shortcutFocusInput': 'Escribir un mensaje',
    'settings.shortcutListening': 'Pulsa una combinación…',
    'settings.shortcutDisabled': 'Desactivada',
    'settings.shortcutClear': 'Desactivar esta acción',
    'settings.shortcutReset': 'Restaurar la combinación predeterminada',
    'settings.shortcutTaken': 'Ya asignada a «{{action}}».',
    'settings.shortcutReserved': 'Reservada: esta tecla mueve el foco por la aplicación.',
    'settings.shortcutsResetAll': 'Restaurar todas las acciones',
  },
  pt: {
    'settings.shortcuts': 'Atalhos de teclado',
    'settings.shortcutsSubtitle': 'Clique numa ação e prima a combinação desejada. Esc cancela.',
    'settings.shortcutsComposer': 'Na caixa de mensagem',
    'settings.shortcutsGlobal': 'Na aplicação',
    'settings.shortcutsOnMessage': 'Numa mensagem',
    'settings.shortcutNewLine': 'Inserir quebra de linha',
    'settings.shortcutToggleSidebar': 'Mostrar ou ocultar a barra lateral',
    'settings.shortcutNextConversation': 'Conversa seguinte',
    'settings.shortcutPrevConversation': 'Conversa anterior',
    'settings.shortcutOpenSettings': 'Abrir as definições',
    'settings.shortcutOpenProfile': 'Abrir o meu perfil',
    'settings.shortcutFocusInput': 'Escrever uma mensagem',
    'settings.shortcutListening': 'Prima uma combinação…',
    'settings.shortcutDisabled': 'Desativada',
    'settings.shortcutClear': 'Desativar esta ação',
    'settings.shortcutReset': 'Repor a combinação padrão',
    'settings.shortcutTaken': 'Já atribuída a «{{action}}».',
    'settings.shortcutReserved': 'Reservada: esta tecla desloca o foco na aplicação.',
    'settings.shortcutsResetAll': 'Repor todas as ações',
  },
  el: {
    'settings.shortcuts': 'Συντομεύσεις πληκτρολογίου',
    'settings.shortcutsSubtitle': 'Κάντε κλικ σε μια ενέργεια και πατήστε τον επιθυμητό συνδυασμό. Το Esc ακυρώνει.',
    'settings.shortcutsComposer': 'Στο πεδίο μηνύματος',
    'settings.shortcutsGlobal': 'Στην εφαρμογή',
    'settings.shortcutsOnMessage': 'Σε μήνυμα',
    'settings.shortcutNewLine': 'Εισαγωγή αλλαγής γραμμής',
    'settings.shortcutToggleSidebar': 'Εμφάνιση ή απόκρυψη πλευρικής μπάρας',
    'settings.shortcutNextConversation': 'Επόμενη συνομιλία',
    'settings.shortcutPrevConversation': 'Προηγούμενη συνομιλία',
    'settings.shortcutOpenSettings': 'Άνοιγμα ρυθμίσεων',
    'settings.shortcutOpenProfile': 'Άνοιγμα του προφίλ μου',
    'settings.shortcutFocusInput': 'Σύνταξη μηνύματος',
    'settings.shortcutListening': 'Πατήστε συνδυασμό…',
    'settings.shortcutDisabled': 'Ανενεργή',
    'settings.shortcutClear': 'Απενεργοποίηση αυτής της ενέργειας',
    'settings.shortcutReset': 'Επαναφορά του προεπιλεγμένου συνδυασμού',
    'settings.shortcutTaken': 'Ήδη δεσμευμένη στο «{{action}}».',
    'settings.shortcutReserved': 'Επιφυλάσσεται: αυτό το πλήκτρο μεταφέρει την εστίαση στην εφαρμογή.',
    'settings.shortcutsResetAll': 'Επαναφορά όλων των ενεργειών',
  },
  da: {
    'settings.shortcuts': 'Tastaturgenveje',
    'settings.shortcutsSubtitle': 'Klik på en handling, og tryk den ønskede kombination. Esc annullerer.',
    'settings.shortcutsComposer': 'I beskedfeltet',
    'settings.shortcutsGlobal': 'I appen',
    'settings.shortcutsOnMessage': 'På en besked',
    'settings.shortcutNewLine': 'Indsæt linjeskift',
    'settings.shortcutToggleSidebar': 'Vis eller skjul sidebjælken',
    'settings.shortcutNextConversation': 'Næste samtale',
    'settings.shortcutPrevConversation': 'Forrige samtale',
    'settings.shortcutOpenSettings': 'Åbn indstillinger',
    'settings.shortcutOpenProfile': 'Åbn min profil',
    'settings.shortcutFocusInput': 'Skriv en besked',
    'settings.shortcutListening': 'Tryk en kombination…',
    'settings.shortcutDisabled': 'Deaktiveret',
    'settings.shortcutClear': 'Deaktiver handlingen',
    'settings.shortcutReset': 'Gendan standardkombinationen',
    'settings.shortcutTaken': 'Allerede tildelt “{{action}}”.',
    'settings.shortcutReserved': 'Reserveret: tasten styrer fokus i appen.',
    'settings.shortcutsResetAll': 'Gendan alle handlinger',
  },
  fi: {
    'settings.shortcuts': 'Pikanäppäimet',
    'settings.shortcutsSubtitle': 'Napsauta toimintoa ja paina haluamasi näppäinyhdistelmä. Esc peruu.',
    'settings.shortcutsComposer': 'Viestikentässä',
    'settings.shortcutsGlobal': 'Sovelluksessa',
    'settings.shortcutsOnMessage': 'Viestissä',
    'settings.shortcutNewLine': 'Lisää rivinvaihto',
    'settings.shortcutToggleSidebar': 'Näytä tai piilota sivupalkki',
    'settings.shortcutNextConversation': 'Seuraava keskustelu',
    'settings.shortcutPrevConversation': 'Edellinen keskustelu',
    'settings.shortcutOpenSettings': 'Avaa asetukset',
    'settings.shortcutOpenProfile': 'Avaa oma profiili',
    'settings.shortcutFocusInput': 'Kirjoita viesti',
    'settings.shortcutListening': 'Paina näppäinyhdistelmä…',
    'settings.shortcutDisabled': 'Pois käytöstä',
    'settings.shortcutClear': 'Poista tämä toiminto käytöstä',
    'settings.shortcutReset': 'Palauta oletusyhdistelmä',
    'settings.shortcutTaken': 'On jo toiminnon “{{action}}” käytössä.',
    'settings.shortcutReserved': 'Varattu: tämä näppäin siirtää fokusointia sovelluksessa.',
    'settings.shortcutsResetAll': 'Palauta kaikki toiminnot',
  },
  sv: {
    'settings.shortcuts': 'Kortkommandon',
    'settings.shortcutsSubtitle': 'Klicka på en åtgärd och tryck den kombination du vill. Esc avbryter.',
    'settings.shortcutsComposer': 'I meddelandefältet',
    'settings.shortcutsGlobal': 'I appen',
    'settings.shortcutsOnMessage': 'På ett meddelande',
    'settings.shortcutNewLine': 'Infoga radbrytning',
    'settings.shortcutToggleSidebar': 'Visa eller dölj sidopanelen',
    'settings.shortcutNextConversation': 'Nästa konversation',
    'settings.shortcutPrevConversation': 'Föregående konversation',
    'settings.shortcutOpenSettings': 'Öppna inställningar',
    'settings.shortcutOpenProfile': 'Öppna min profil',
    'settings.shortcutFocusInput': 'Skriv ett meddelande',
    'settings.shortcutListening': 'Tryck en kombination…',
    'settings.shortcutDisabled': 'Inaktiverad',
    'settings.shortcutClear': 'Inaktivera åtgärden',
    'settings.shortcutReset': 'Återställ standardkombinationen',
    'settings.shortcutTaken': 'Används redan av “{{action}}”.',
    'settings.shortcutReserved': 'Reserverad: den här tangenten styr fokus i appen.',
    'settings.shortcutsResetAll': 'Återställ alla åtgärder',
  },
  hr: {
    'settings.shortcuts': 'Tipkovnički prečaci',
    'settings.shortcutsSubtitle': 'Kliknite radnju i pritisnite željenu kombinaciju. Esc poništava.',
    'settings.shortcutsComposer': 'U polju poruke',
    'settings.shortcutsGlobal': 'U aplikaciji',
    'settings.shortcutsOnMessage': 'Na poruci',
    'settings.shortcutNewLine': 'Umetni prijelom retka',
    'settings.shortcutToggleSidebar': 'Prikaži ili sakrij bočnu traku',
    'settings.shortcutNextConversation': 'Sljedeći razgovor',
    'settings.shortcutPrevConversation': 'Prethodni razgovor',
    'settings.shortcutOpenSettings': 'Otvori postavke',
    'settings.shortcutOpenProfile': 'Otvori moj profil',
    'settings.shortcutFocusInput': 'Napiši poruku',
    'settings.shortcutListening': 'Pritisnite kombinaciju…',
    'settings.shortcutDisabled': 'Onemogućeno',
    'settings.shortcutClear': 'Onemogući ovu radnju',
    'settings.shortcutReset': 'Vrati zadanu kombinaciju',
    'settings.shortcutTaken': 'Već dodijeljena radnji „{{action}}”.',
    'settings.shortcutReserved': 'Rezervirano: ova tipka vodi fokus u aplikaciji.',
    'settings.shortcutsResetAll': 'Vrati sve radnje',
  },
  et: {
    'settings.shortcuts': 'Kiirklahvid',
    'settings.shortcutsSubtitle': 'Klõpsa toimingule ja vajuta soovitud kombinatsioon. Esc tühistab.',
    'settings.shortcutsComposer': 'Sõnumiväljal',
    'settings.shortcutsGlobal': 'Rakenduses',
    'settings.shortcutsOnMessage': 'Sõnumil',
    'settings.shortcutNewLine': 'Sisesta reavahetus',
    'settings.shortcutToggleSidebar': 'Näita või peida külgriba',
    'settings.shortcutNextConversation': 'Järgmine vestlus',
    'settings.shortcutPrevConversation': 'Eelmine vestlus',
    'settings.shortcutOpenSettings': 'Ava seaded',
    'settings.shortcutOpenProfile': 'Ava minu profiil',
    'settings.shortcutFocusInput': 'Kirjuta sõnum',
    'settings.shortcutListening': 'Vajuta kombinatsioon…',
    'settings.shortcutDisabled': 'Välja lülitatud',
    'settings.shortcutClear': 'Lülita see toiming välja',
    'settings.shortcutReset': 'Taasta vaikimisi kombinatsioon',
    'settings.shortcutTaken': 'On juba toimingu „{{action}}” kasutusel.',
    'settings.shortcutReserved': 'Kaitstud: selle klahviga liigub fookus rakenduses.',
    'settings.shortcutsResetAll': 'Taasta kõik toimingud',
  },
  hu: {
    'settings.shortcuts': 'Billentyűparancsok',
    'settings.shortcutsSubtitle': 'Kattints egy műveletre, majd nyomd meg a kívánt kombinációt. Az Esc megszakítja.',
    'settings.shortcutsComposer': 'Az üzenetmezőben',
    'settings.shortcutsGlobal': 'Az alkalmazásban',
    'settings.shortcutsOnMessage': 'Egy üzeneten',
    'settings.shortcutNewLine': 'Sortörés beszúrása',
    'settings.shortcutToggleSidebar': 'Oldalsáv megjelenítése vagy elrejtése',
    'settings.shortcutNextConversation': 'Következő beszélgetés',
    'settings.shortcutPrevConversation': 'Előző beszélgetés',
    'settings.shortcutOpenSettings': 'Beállítások megnyitása',
    'settings.shortcutOpenProfile': 'Saját profil megnyitása',
    'settings.shortcutFocusInput': 'Üzenet írása',
    'settings.shortcutListening': 'Nyomj egy kombinációt…',
    'settings.shortcutDisabled': 'Kikapcsolva',
    'settings.shortcutClear': 'Művelet kikapcsolása',
    'settings.shortcutReset': 'Alapértelmezett kombináció visszaállítása',
    'settings.shortcutTaken': 'Már hozzárendelve ehhez: „{{action}}”.',
    'settings.shortcutReserved': 'Foglalt: ez a billentyű vezérli a fókuszt az alkalmazásban.',
    'settings.shortcutsResetAll': 'Összes művelet visszaállítása',
  },
  lv: {
    'settings.shortcuts': 'Tastatūras saīsnes',
    'settings.shortcutsSubtitle': 'Klikšķiniet uz darbības un nospiediet vēlamo kombināciju. Esc atceļ.',
    'settings.shortcutsComposer': 'Ziņojuma laukā',
    'settings.shortcutsGlobal': 'Lietotnē',
    'settings.shortcutsOnMessage': 'Ziņojumā',
    'settings.shortcutNewLine': 'Ievietot rindiņas maiņu',
    'settings.shortcutToggleSidebar': 'Rādīt vai slēpt sānjoslu',
    'settings.shortcutNextConversation': 'Nākamā saruna',
    'settings.shortcutPrevConversation': 'Iepriekšējā saruna',
    'settings.shortcutOpenSettings': 'Atvērt iestatījumus',
    'settings.shortcutOpenProfile': 'Atvērt manu profilu',
    'settings.shortcutFocusInput': 'Rakstīt ziņojumu',
    'settings.shortcutListening': 'Nospiediet kombināciju…',
    'settings.shortcutDisabled': 'Atspējots',
    'settings.shortcutClear': 'Atspējot šo darbību',
    'settings.shortcutReset': 'Atjaunot noklusēto kombināciju',
    'settings.shortcutTaken': 'Jau piesaistīta darbībai „{{action}}”.',
    'settings.shortcutReserved': 'Rezervēta: ar šo taustiņu pārvietojas fokuss lietotnē.',
    'settings.shortcutsResetAll': 'Atjaunot visas darbības',
  },
  lt: {
    'settings.shortcuts': 'Spartieji klavišai',
    'settings.shortcutsSubtitle': 'Spustelėkite veiksmą ir paspauskite norėtamą kombinaciją. Esc atšaukia.',
    'settings.shortcutsComposer': 'Žinutės lauke',
    'settings.shortcutsGlobal': 'Programoje',
    'settings.shortcutsOnMessage': 'Žinutėje',
    'settings.shortcutNewLine': 'Įterpti paeigą',
    'settings.shortcutToggleSidebar': 'Rodyti arba slėpti šoninę juostą',
    'settings.shortcutNextConversation': 'Kitas pokalbis',
    'settings.shortcutPrevConversation': 'Ankstesnis pokalbis',
    'settings.shortcutOpenSettings': 'Atidaryti nustatymus',
    'settings.shortcutOpenProfile': 'Atidaryti mano profilį',
    'settings.shortcutFocusInput': 'Rašyti žinutę',
    'settings.shortcutListening': 'Paspauskite kombinaciją…',
    'settings.shortcutDisabled': 'Išjungta',
    'settings.shortcutClear': 'Išjungti šį veiksmą',
    'settings.shortcutReset': 'Atkurti numatytąją kombinaciją',
    'settings.shortcutTaken': 'Jau priskirta veiksmui „{{action}}”.',
    'settings.shortcutReserved': 'Rezervuota: šiuo klavišu juda fokusas programoje.',
    'settings.shortcutsResetAll': 'Atkurti visus veiksmus',
  },
  mt: {
    'settings.shortcuts': 'Xqufitturi tat-tastiera',
    'settings.shortcutsSubtitle': 'Agħfas fuq azzjoni u mbagħad ikteb il-kombinazzjoni li trid. Esc jikkanċella.',
    'settings.shortcutsComposer': 'Fil-qasam tal-messaġġ',
    'settings.shortcutsGlobal': 'Fl-applikazzjoni',
    'settings.shortcutsOnMessage': 'Fuq messaġġ',
    'settings.shortcutNewLine': 'Daħħal linġa ġdida',
    'settings.shortcutToggleSidebar': 'Uri jew aħbi s-faxxa laterali',
    'settings.shortcutNextConversation': 'Konversazzjoni li jmiss',
    'settings.shortcutPrevConversation': 'Konversazzjoni ta’ qabel',
    'settings.shortcutOpenSettings': 'Iftaħ il-konfigurazzjonijiet',
    'settings.shortcutOpenProfile': 'Iftaħ il-profil tiegħi',
    'settings.shortcutFocusInput': 'Ikteb messaġġ',
    'settings.shortcutListening': 'Agħfas kombinazzjoni…',
    'settings.shortcutDisabled': 'Mhux attiva',
    'settings.shortcutClear': 'Itfi din l-azzjoni',
    'settings.shortcutReset': 'Irkupra l-kombinazzjoni oriġinali',
    'settings.shortcutTaken': 'Diġà assenjata lil “{{action}}”.',
    'settings.shortcutReserved': 'Riżervata: din it-tastja timmanaġja l-fokus fl-applikazzjoni.',
    'settings.shortcutsResetAll': 'Irkupra l-azzjonijiet kollha',
  },
  pl: {
    'settings.shortcuts': 'Skróty klawiszowe',
    'settings.shortcutsSubtitle': 'Kliknij czynność i wciśnij żądaną kombinację. Esc anuluje.',
    'settings.shortcutsComposer': 'W polu wiadomości',
    'settings.shortcutsGlobal': 'W aplikacji',
    'settings.shortcutsOnMessage': 'Na wiadomości',
    'settings.shortcutNewLine': 'Wstaw nowy wiersz',
    'settings.shortcutToggleSidebar': 'Pokaż lub ukryj pasek boczny',
    'settings.shortcutNextConversation': 'Następna rozmowa',
    'settings.shortcutPrevConversation': 'Poprzednia rozmowa',
    'settings.shortcutOpenSettings': 'Otwórz ustawienia',
    'settings.shortcutOpenProfile': 'Otwórz mój profil',
    'settings.shortcutFocusInput': 'Napisz wiadomość',
    'settings.shortcutListening': 'Wciśnij kombinację…',
    'settings.shortcutDisabled': 'Wyłączony',
    'settings.shortcutClear': 'Wyłącz tę czynność',
    'settings.shortcutReset': 'Przywróć domyślną kombinację',
    'settings.shortcutTaken': 'Już przypisana do „{{action}}”.',
    'settings.shortcutReserved': 'Zastrzeżone: ten klawisz przenosi fokus w aplikacji.',
    'settings.shortcutsResetAll': 'Przywróć wszystkie czynności',
  },
  sk: {
    'settings.shortcuts': 'Klávesové skratky',
    'settings.shortcutsSubtitle': 'Kliknite na akciu a stlačte požadovanú kombináciu. Esc zruší zadanie.',
    'settings.shortcutsComposer': 'V poli správy',
    'settings.shortcutsGlobal': 'V aplikácii',
    'settings.shortcutsOnMessage': 'Na správe',
    'settings.shortcutNewLine': 'Vložiť zalomenie riadka',
    'settings.shortcutToggleSidebar': 'Zobraziť alebo skryť bočný panel',
    'settings.shortcutNextConversation': 'Ďalšia konverzácia',
    'settings.shortcutPrevConversation': 'Predchádzajúca konverzácia',
    'settings.shortcutOpenSettings': 'Otvoriť nastavenia',
    'settings.shortcutOpenProfile': 'Otvoriť môj profil',
    'settings.shortcutFocusInput': 'Napísať správu',
    'settings.shortcutListening': 'Stlačte kombináciu…',
    'settings.shortcutDisabled': 'Vypnuté',
    'settings.shortcutClear': 'Vypnúť túto akciu',
    'settings.shortcutReset': 'Obnoviť predvolenú kombináciu',
    'settings.shortcutTaken': 'Už priradená akcii „{{action}}”.',
    'settings.shortcutReserved': 'Vyhradené: tento kláves presúva fokus v aplikácii.',
    'settings.shortcutsResetAll': 'Obnoviť všetky akcie',
  },
  sl: {
    'settings.shortcuts': 'Tipkovne bližnjice',
    'settings.shortcutsSubtitle': 'Kliknite dejanje in pritisnite želeno kombinacijo. Esc prekliče.',
    'settings.shortcutsComposer': 'V polju sporočila',
    'settings.shortcutsGlobal': 'V aplikaciji',
    'settings.shortcutsOnMessage': 'V sporočilu',
    'settings.shortcutNewLine': 'Vstavi prelom vrstice',
    'settings.shortcutToggleSidebar': 'Pokaži ali skrij stransko vrstico',
    'settings.shortcutNextConversation': 'Naslednji pogovor',
    'settings.shortcutPrevConversation': 'Prejšnji pogovor',
    'settings.shortcutOpenSettings': 'Odpri nastavitve',
    'settings.shortcutOpenProfile': 'Odpri moj profil',
    'settings.shortcutFocusInput': 'Napiši sporočilo',
    'settings.shortcutListening': 'Pritisnite kombinacijo…',
    'settings.shortcutDisabled': 'Onemogočeno',
    'settings.shortcutClear': 'Onemoči to dejanje',
    'settings.shortcutReset': 'Ponastavi privzeto kombinacijo',
    'settings.shortcutTaken': 'Že dodeljena dejanju „{{action}}”.',
    'settings.shortcutReserved': 'Rezervirano: ta tipka premika fokus v aplikaciji.',
    'settings.shortcutsResetAll': 'Ponastavi vsa dejanja',
  },
  cs: {
    'settings.shortcuts': 'Klávesové zkratky',
    'settings.shortcutsSubtitle': 'Klepněte na akci a stiskněte požadovanou kombinaci. Esc zadání zruší.',
    'settings.shortcutsComposer': 'V poli zprávy',
    'settings.shortcutsGlobal': 'V aplikaci',
    'settings.shortcutsOnMessage': 'Ve zprávě',
    'settings.shortcutNewLine': 'Vložit zalomení řádku',
    'settings.shortcutToggleSidebar': 'Zobrazit nebo skrýt boční panel',
    'settings.shortcutNextConversation': 'Další konverzace',
    'settings.shortcutPrevConversation': 'Předchozí konverzace',
    'settings.shortcutOpenSettings': 'Otevřít nastavení',
    'settings.shortcutOpenProfile': 'Otevřít můj profil',
    'settings.shortcutFocusInput': 'Napsat zprávu',
    'settings.shortcutListening': 'Stiskněte kombinaci…',
    'settings.shortcutDisabled': 'Vypnuto',
    'settings.shortcutClear': 'Vypnout tuto akci',
    'settings.shortcutReset': 'Obnovit výchozí kombinaci',
    'settings.shortcutTaken': 'Už přiřazena akci „{{action}}”.',
    'settings.shortcutReserved': 'Rezervováno: tato klávesa přesouvá fokus v aplikaci.',
    'settings.shortcutsResetAll': 'Obnovit všechny akce',
  },
  bg: {
    'settings.shortcuts': 'Клавишни комбинации',
    'settings.shortcutsSubtitle': 'Кликнете върху действие и натиснете желаната комбинация. Esc отменя.',
    'settings.shortcutsComposer': 'В полето за съобщение',
    'settings.shortcutsGlobal': 'В приложението',
    'settings.shortcutsOnMessage': 'Върху съобщение',
    'settings.shortcutNewLine': 'Вмъкване на нов ред',
    'settings.shortcutToggleSidebar': 'Показване или скриване на страничната лента',
    'settings.shortcutNextConversation': 'Следващ разговор',
    'settings.shortcutPrevConversation': 'Предишен разговор',
    'settings.shortcutOpenSettings': 'Отваряне на настройките',
    'settings.shortcutOpenProfile': 'Отваряне на профила ми',
    'settings.shortcutFocusInput': 'Напишете съобщение',
    'settings.shortcutListening': 'Натиснете комбинация…',
    'settings.shortcutDisabled': 'Изключено',
    'settings.shortcutClear': 'Изключване на това действие',
    'settings.shortcutReset': 'Възстановяване на подразбираната комбинация',
    'settings.shortcutTaken': 'Вече е зададено на „{{action}}“.',
    'settings.shortcutReserved': 'Запазено: този клавиш води фокуса в приложението.',
    'settings.shortcutsResetAll': 'Възстановяване на всички действия',
  },
  ga: {
    'settings.shortcuts': 'Aicearraí',
    'settings.shortcutsSubtitle': 'Cliceáil ar ghníomh agus brúigh an comcheangal is mian leat. Cealaíonn Esc é.',
    'settings.shortcutsComposer': 'Sa réimse teachtaireachta',
    'settings.shortcutsGlobal': 'San aip',
    'settings.shortcutsOnMessage': 'Ar theachtaireacht',
    'settings.shortcutNewLine': 'Cuir líne nua isteach',
    'settings.shortcutToggleSidebar': 'Taispeáin nó folaigh an barra taobh',
    'settings.shortcutNextConversation': 'An chomhradh seo chugainn',
    'settings.shortcutPrevConversation': 'An comhradh roimhe seo',
    'settings.shortcutOpenSettings': 'Oscail na socruithe',
    'settings.shortcutOpenProfile': 'Oscail mo phróifíl',
    'settings.shortcutFocusInput': 'Scríobh teachtaireacht',
    'settings.shortcutListening': 'Brúigh comcheangal…',
    'settings.shortcutDisabled': 'Míchumasaithe',
    'settings.shortcutClear': 'Díchumasaigh an gníomh seo',
    'settings.shortcutReset': 'Cuir an bun-chomcheangal ar ais',
    'settings.shortcutTaken': 'San úsáid ag “{{action}}” cheana.',
    'settings.shortcutReserved': 'Cosainte: bogann an eochair seo an fócas san aip.',
    'settings.shortcutsResetAll': 'Cuir gach gníomh ar ais',
  },
  ro: {
    'settings.shortcuts': 'Comenzi rapide de la tastatură',
    'settings.shortcutsSubtitle': 'Faceți clic pe o acțiune, apoi apăsați combinația dorită. Esc anulează.',
    'settings.shortcutsComposer': 'În câmpul de mesaj',
    'settings.shortcutsGlobal': 'În aplicație',
    'settings.shortcutsOnMessage': 'Pe un mesaj',
    'settings.shortcutNewLine': 'Inserează întrerupere de linie',
    'settings.shortcutToggleSidebar': 'Afișează sau ascunde bara laterală',
    'settings.shortcutNextConversation': 'Conversația următoare',
    'settings.shortcutPrevConversation': 'Conversația anterioară',
    'settings.shortcutOpenSettings': 'Deschide setările',
    'settings.shortcutOpenProfile': 'Deschide profilul meu',
    'settings.shortcutFocusInput': 'Scrie un mesaj',
    'settings.shortcutListening': 'Apăsați o combinație…',
    'settings.shortcutDisabled': 'Dezactivat',
    'settings.shortcutClear': 'Dezactivează această acțiune',
    'settings.shortcutReset': 'Reface combinația implicită',
    'settings.shortcutTaken': 'Deja atribuită acțiunii „{{action}}”.',
    'settings.shortcutReserved': 'Rezervată: această tastă poartă focusul în aplicație.',
    'settings.shortcutsResetAll': 'Reface toate acțiunile',
  },
  en: {
    'settings.shortcuts': 'Keyboard shortcuts',
    'settings.shortcutsSubtitle': 'Click an action, then press the combination you want. Esc cancels.',
    'settings.shortcutsComposer': 'In the message box',
    'settings.shortcutsGlobal': 'Across the app',
    'settings.shortcutsOnMessage': 'On a message',
    'settings.shortcutNewLine': 'Insert a line break',
    'settings.shortcutToggleSidebar': 'Show or hide the sidebar',
    'settings.shortcutNextConversation': 'Next conversation',
    'settings.shortcutPrevConversation': 'Previous conversation',
    'settings.shortcutOpenSettings': 'Open settings',
    'settings.shortcutOpenProfile': 'Open my profile',
    'settings.shortcutFocusInput': 'Write a message',
    'settings.shortcutListening': 'Press a combination…',
    'settings.shortcutDisabled': 'Off',
    'settings.shortcutClear': 'Turn off this shortcut',
    'settings.shortcutReset': 'Restore default combination',
    'settings.shortcutTaken': 'Already set for “{{action}}”.',
    'settings.shortcutReserved': 'Reserved: this key moves focus through the app.',
    'settings.shortcutsResetAll': 'Restore all shortcuts',
  },
  uk: {
    'settings.shortcuts': 'Клавіатурні скорочення',
    'settings.shortcutsSubtitle': 'Натисніть на дію, а потім введіть потрібну комбінацію. Esc скасовує.',
    'settings.shortcutsComposer': 'У полі повідомлення',
    'settings.shortcutsGlobal': 'У застосунку',
    'settings.shortcutsOnMessage': 'На повідомленні',
    'settings.shortcutNewLine': 'Вставити розрив рядка',
    'settings.shortcutToggleSidebar': 'Показати або сховати бічну панель',
    'settings.shortcutNextConversation': 'Наступна розмова',
    'settings.shortcutPrevConversation': 'Попередня розмова',
    'settings.shortcutOpenSettings': 'Відкрити налаштування',
    'settings.shortcutOpenProfile': 'Відкрити мій профіль',
    'settings.shortcutFocusInput': 'Написати повідомлення',
    'settings.shortcutListening': 'Введіть комбінацію…',
    'settings.shortcutDisabled': 'Вимкнено',
    'settings.shortcutClear': 'Вимкнути цю дію',
    'settings.shortcutReset': 'Відновити типову комбінацію',
    'settings.shortcutTaken': 'Уже призначено дії «{{action}}».',
    'settings.shortcutReserved': 'Зайнята: ця клавіша переводить фокус у застосунку.',
    'settings.shortcutsResetAll': 'Відновити всі дії',
  },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

// Each locale block starts with `  <code>: {` at two-space indent and holds one
// nested `translation` object made of flat "a.b" keys.
const marks = []
lines.forEach((line, i) => {
  const m = /^  ([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

const known = Object.keys(DATA)
const missing = known.filter((c) => !marks.some((m) => m.code === c))
if (missing.length) {
  console.error(`✗ locale blocks not found in translations.ts: ${missing.join(', ')}`)
  process.exit(1)
}
const unknownBlocks = marks.filter((m) => !known.includes(m.code)).map((m) => m.code)
if (unknownBlocks.length) {
  console.error(`✗ translations.ts has locales without data: ${unknownBlocks.join(', ')}`)
  process.exit(1)
}

let replaced = 0
let inserted = 0

// Walk backwards: splicing a block must not shift the indexes of the previous ones.
for (let b = marks.length - 1; b >= 0; b--) {
  const code = marks[b].code
  const start = marks[b].i + 1
  const end = b + 1 < marks.length ? marks[b + 1].i : lines.length
  const block = lines.slice(start, end)
  const table = DATA[code]
  const pending = []

  for (const key of KEYS) {
    const line = `      "${key}": "${escapeValue(table[key])}",`
    const re = new RegExp('^[ \\t]*"' + key.replace(/\./g, '\\.') + '":\\s*"(?:[^"\\\\]|\\\\.)*",?[ \\t]*$')
    const at = block.findIndex((l) => re.test(l))
    if (at >= 0) {
      if (block[at] !== line) { block[at] = line; replaced++ }
    } else {
      pending.push(line)
    }
  }

  if (pending.length) {
    // Land right after the a11y row that already promises « Afficher les
    // raccourcis clavier » : the editor is what that switch was describing.
    let anchor = -1
    for (let i = 0; i < block.length; i++) {
      if (/^ {6}"settings\.keyboardNavigationDesc":/.test(block[i])) { anchor = i; break }
    }
    if (anchor < 0) {
      console.error(`✗ no "settings.keyboardNavigationDesc" anchor in the ${code} block`)
      process.exit(1)
    }
    block.splice(anchor + 1, 0, ...pending)
    inserted += pending.length
  }

  lines.splice(start, end - start, ...block)
}

writeFileSync(file, lines.join(eol), 'utf8')

// A block-level loop can silently drop a locale: count the keys again on the
// file as written, not on the counters.
const after = readFileSync(file, 'utf8')
for (const key of KEYS) {
  const at = after.split(`"${key}":`).length - 1
  if (at !== known.length) {
    console.error(`✗ "${key}" appears ${at} times, expected ${known.length}`)
    process.exit(1)
  }
}

// Every translation must carry the placeholder: a locale that drops it would
// render the refusal with no action named.
for (const code of known) {
  const taken = DATA[code]['settings.shortcutTaken']
  if (!taken.includes('{{action}}')) {
    console.error(`✗ ${code}: settings.shortcutTaken lost its {{action}} placeholder`)
    process.exit(1)
  }
}

console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
