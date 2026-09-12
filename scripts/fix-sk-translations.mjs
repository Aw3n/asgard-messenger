import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const skTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Nahrať fotku',
  'avatar.cropAvatar': 'Orezať avatar',
  'avatar.cancel': 'Zrušiť',
  'avatar.cropSave': 'Orezať a uložiť',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Obnoviť pripojenie k serveru',
  'calls.noContactsFound': 'Kontakty neboli nájdené',
  'calls.startCallHint': 'Spustite hovor zo zoznamu kontaktov',

  // ─── common ───
  'common.admin': 'Administrátor',

  // ─── contacts ───
  'contacts.reloadContacts': 'Znova načítať kontakty z úložiska Hyperbee',
  'contacts.displayNameOptional': 'Zobrazované meno (voliteľné)',
  'contacts.displayNamePlaceholder': 'Ako by sa mali zobrazovať?',
  'contacts.selectContact': 'Vyberte kontakt pre zobrazenie podrobností',
  'contacts.noBlockedContacts': 'Žiadne zablokované kontakty',
  'contacts.noContactsFound': 'Kontakty neboli nájdené',
  'contacts.error.publicKeyRequired': 'Zadajte verejný kľúč',
  'contacts.error.invalidPublicKey': 'Neplatný formát verejného kľúča',
  'contacts.error.noIdentity': 'Identita nie je k dispozícii',
  'contacts.error.noContactsFound': 'Kontakty neboli nájdené v úložisku Hyperbee',
  'contacts.error.failedToReload': 'Nepodarilo sa znova načítať kontakty',

  // ─── groups ───
  'groups.admins': 'Administrátori',
  'groups.groups': 'Skupiny',
  'groups.create': 'Vytvoriť',
  'groups.searchGroups': 'Hľadať skupiny…',
  'groups.noGroupsFound': 'Skupiny neboli nájdené',
  'groups.noGroupsYet': 'Zatiaľ žiadne skupiny',
  'groups.createGroupHint': 'Vytvorte skupinu pre začatie spolupráce',
  'groups.createFirstGroup': 'Vytvorte svoju prvú skupinu',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Zrušiť odpoveď',
  'messageInput.attachFile': 'Pripojiť súbor',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Odoslať správu',
  'messageInput.dropFiles': 'Presuňte súbory sem',
  'messageInput.replyingTo': 'Odpovedanie na',
  'messageInput.messageDeleted': 'Správa odstránená',

  // ─── modal ───
  'modal.addContact': 'Pridať kontakt',
  'modal.publicKey': 'Verejný kľúč',
  'modal.publicKeyPlaceholder': 'Zadajte verejný kľúč kontaktu…',
  'modal.displayName': 'Zobrazované meno (voliteľné)',
  'modal.displayNamePlaceholder': 'Pomenujte tento kontakt…',
  'modal.cancel': 'Zrušiť',
  'modal.add': 'Pridať',
  'modal.shareKey': 'Zdieľajte svoj verejný kľúč s kontaktom, aby vás tiež mohol pridať. Nájdete ho v Nastavenia → Profil.',
  'modal.error.publicKeyRequired': 'Verejný kľúč je povinný',
  'modal.error.publicKeyTooShort': 'Verejný kľúč je príliš krátky',
  'modal.error.contactExists': 'Kontakt už existuje',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimalizovať',
  'titlebar.maximize': 'Maximalizovať',
  'titlebar.close': 'Zavrieť',

  // ─── toast ───
  'toast.dismiss': 'Zavrieť',
  'toast.dataImported': 'Údaje boli úspešne importované',
  'toast.importFailed': 'Importovanie zlyhalo',
  'toast.invalidBackupFile': 'Neplatný súbor zálohy',
  'toast.cacheCleared': 'Vyrovnávacia pamäť vymazaná',
  'toast.failedToClearCache': 'Vymazanie vyrovnávacej pamäte zlyhalo',
  'toast.permissionGranted': 'Povolenie udelené',
  'toast.permissionDenied': 'Povolenie zamietnuté',
  'toast.microphoneUpdated': 'Mikrofón aktualizovaný',
  'toast.cameraUpdated': 'Kamera aktualizovaná',
  'toast.speakerUpdated': 'Reproduktor aktualizovaný',
  'toast.cameraTestFailed': 'Test kamery zlyhal',
  'toast.addressCopied': 'Adresa skopírovaná do schránky',
  'toast.failedToCopyAddress': 'Kopírovanie adresy zlyhalo',
  'toast.contactAdded': 'Kontakt pridaný — vyhľadávanie spustené',
  'toast.failedToAddContact': 'Pridanie kontaktu zlyhalo',

  // ─── settings ───
  'settings.audio': 'Zvuk',
  'settings.fileType_audio': 'Zvuk',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Verzia {{version}}',
  'settings.accessibilitySubtitle': 'Urobte Asgard prístupnejším pre vás',
  'settings.atTheFollowingAddress': 'na nasledujúcej adrese:',
  'settings.audioQuality_high': 'Vysoká',
  'settings.audioQuality_low': 'Nízka',
  'settings.audioQuality_medium': 'Stredná',
  'settings.autoDownload': 'Automatické sťahovanie',
  'settings.autoDownloadAudioDesc': 'Automaticky sťahovať zvukové správy',
  'settings.autoDownloadImagesDesc': 'Automaticky sťahovať obrázky',
  'settings.autoDownloadVideosDesc': 'Automaticky sťahovať videá',
  'settings.autoEmoji': 'Automatické emoji',
  'settings.autoEmojiDesc': 'Konvertovať textové skratky ako :) na emoji',
  'settings.autoPlayGifs': 'Automaticky prehrávať GIFy',
  'settings.autoPlayGifsDesc': 'Automaticky animovať GIF obrázky',
  'settings.autoPlayVideos': 'Automaticky prehrávať videá',
  'settings.autoPlayVideosDesc': 'Automaticky prehrávať videá, keď sú viditeľné',
  'settings.bandwidth': 'Šírka pásma',
  'settings.batterySaver': 'Šetrič batérie',
  'settings.batterySaverDesc': 'Pozastaviť P2P, keď je aplikácia na pozadí',
  'settings.builtWith': 'Vytvorené s: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Test kamery zlyhal',
  'settings.cameraUpdated': 'Kamera aktualizovaná',
  'settings.cameras': 'Kamery',
  'settings.chatDensity_comfortable': 'Pohodlná',
  'settings.chatDensity_compact': 'Kompaktná',
  'settings.chatDensity_cozy': 'Pohodlná',
  'settings.chatSubtitle': 'Konfigurujte svoje chatové prostredie',
  'settings.clearCache': 'Vymazať vyrovnávaciu pamäť',
  'settings.clickToCopy': 'Kliknutím skopírujte',
  'settings.collapseMessages': 'Zbaliť správy',
  'settings.collapseMessagesDesc': 'Zoskupiť po sebe idúce správy od toho istého odosielateľa',
  'settings.compressImages': 'Komprimovať obrázky',
  'settings.compressImagesDesc': 'Komprimovať obrázky pred odoslaním',
  'settings.compressVideos': 'Komprimovať videá',
  'settings.compressVideosDesc': 'Komprimovať videá pred odoslaním na zníženie spotreby dát',
  'settings.connected': 'Pripojené',
  'settings.connecting': 'Pripájanie',
  'settings.connectionStatus': 'Stav pripojenia',
  'settings.copied': 'Skopírované!',
  'settings.copyToClipboard': 'Kopírovať do schránky',
  'settings.defaultAudioQuality': 'Predvolená kvalita zvuku',
  'settings.defaultSpeaker': 'Predvolený reproduktor',
  'settings.defaultVideoQuality': 'Predvolená kvalita videa',
  'settings.detectedHardware': 'Rozpoznaný hardvér',
  'settings.devicesAreAutoDetected': 'Zariadenia sa rozpoznávajú automaticky. Zmeny sa aplikujú v reálnom čase.',
  'settings.disconnected': 'Odpojené',
  'settings.doNotDisturb': 'Nerušiť',
  'settings.doNotDisturbDesc': 'Potlačiť všetky upozornenia',
  'settings.doYouLikeAsgard': 'Páči sa vám aplikácia Asgard?',
  'settings.donationIn': 'Prispieť',
  'settings.enableNotifications': 'Povoliť upozornenia',
  'settings.enableNotificationsDesc': 'Zobraziť upozornenia Windows pre nové správy',
  'settings.enableRelay': 'Povoliť prenos',
  'settings.enableRelayDesc': 'Používať slepé prenosy, keď priame pripojenia nie sú k dispozícii',
  'settings.exportData': 'Exportovať údaje',
  'settings.flushDht': 'Vyprázdniť DHT',
  'settings.grantPermission': 'Udeliť povolenie',
  'settings.grantPermissionDesc': 'Udeľte povolenie na zobrazenie názvov zariadení a konfiguráciu hardvéru.',
  'settings.hideRecoveryPhrase': 'Skryť frázu na obnovenie',
  'settings.highContrast': 'Vysoký kontrast',
  'settings.highContrastDesc': 'Zvýšiť kontrast pre lepšiu viditeľnosť',
  'settings.importData': 'Importovať údaje',
  'settings.inlinePreviews': 'Vstavané náhľady',
  'settings.inlinePreviewsDesc': 'Zobrazovať náhľady obrázkov priamo v chate',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Navigácia klávesnicou',
  'settings.keyboardNavigationDesc': 'Zobraziť klávesové skratky a indikátory fokusu',
  'settings.largerTouchTargets': 'Väčšie dotykové ciele',
  'settings.largerTouchTargetsDesc': 'Urobiť tlačidlá a interaktívne prvky ľahšie dotknuteľné',
  'settings.linkPreviews': 'Náhľady odkazov',
  'settings.linkPreviewsDesc': 'Automaticky získavať a zobrazovať náhľady odkazov (môže odhaliť vašu aktivitu prehliadania)',
  'settings.localCache': 'Lokálna vyrovnávacia pamäť',
  'settings.manageTrash': 'Spravovať kôš',
  'settings.maxPeers': 'Maximálny počet peerov',
  'settings.mbLimit': 'Limit MB',
  'settings.mediaSubtitle': 'Konfigurujte prehrávanie a kompresiu médií',
  'settings.mentionsOnly': 'Iba zmienky',
  'settings.mentionsOnlyDesc': 'Upozorňovať iba na zmienky a priame správy',
  'settings.messageDensity': 'Hustota správ',
  'settings.messagePreview': 'Náhľad správy',
  'settings.messagePreviewDesc': 'Zobrazovať obsah správy v upozorneniach',
  'settings.microphone': 'Mikrofón',
  'settings.microphoneAccess': 'Prístup k mikrofónu a kamere',
  'settings.microphoneUpdated': 'Mikrofón aktualizovaný',
  'settings.microphones': 'Mikrofóny',
  'settings.muteByDefault': 'Predvolene stlmené',
  'settings.muteByDefaultDesc': 'Spúšťať videá v stlmenom režime',
  'settings.networkSubtitle': 'Nastavenia pripojenia P2P',
  'settings.neverShareRecoveryPhrase': 'Nikdy nezdieľajte svoju frázu na obnovenie!',
  'settings.new': 'Nový',
  'settings.notAvailable': 'Nedostupné',
  'settings.notificationSoundDesc': 'Prehrať zvuk pre nové správy',
  'settings.onlineStatus': 'Online stav',
  'settings.onlineStatusDesc': 'Povoliť kontaktom vidieť váš online stav',
  'settings.peerLatency': 'Latencia peerov',
  'settings.peerQuality': 'Kvalita peerov',
  'settings.peers': 'Peery',
  'settings.readReceipts': 'Potvrdenia o prečítaní',
  'settings.readReceiptsDesc': 'Informovať ostatných, keď prečítate ich správy',
  'settings.recoveryPhrase': 'Fráza na obnovenie',
  'settings.recoveryPhraseDesc': 'Vaša 24-slovová fráza na obnovenie môže byť použitá na obnovenie vašej identity na inom zariadení. Uchovávajte ju bezpečne a nikdy ju nezdieľajte.',
  'settings.recoveryPhraseWarning': 'Ktokoľvek s týmito slovami môže získať prístup k vášmu účtu.',
  'settings.reducedMotion': 'Znížiť animácie',
  'settings.reducedMotionDesc': 'Minimalizovať animácie a prechody',
  'settings.screenReaderOptimizations': 'Optimalizácie čítača obrazovky',
  'settings.screenReaderOptimizationsDesc': 'Vylepšená podpora pre čítače obrazovky',
  'settings.securitySubtitle': 'Spravujte svoju identitu a frázu na obnovenie',
  'settings.sendOnEnter': 'Odoslať klávesom Enter',
  'settings.sendOnEnterDesc': 'Stlačte Enter na odoslanie, Shift+Enter pre nový riadok',
  'settings.showReadStatus': 'Zobraziť stav čítania',
  'settings.showReadStatusDesc': 'Zobraziť potvrdenia o prečítaní na odoslaných správach',
  'settings.showRecoveryPhrase': 'Zobraziť frázu na obnovenie',
  'settings.showSeconds': 'Zobraziť sekundy',
  'settings.showSecondsDesc': 'Zahrnúť sekundy do časových pečiatok',
  'settings.showTimestamps': 'Zobraziť časové pečiatky',
  'settings.showTimestampsDesc': 'Zobraziť čas vedľa každej správy',
  'settings.showVideoControls': 'Zobraziť ovládacie prvky videa',
  'settings.showVideoControlsDesc': 'Zobraziť ovládacie prvky prehrávania na videách',
  'settings.speaker': 'Reproduktor',
  'settings.speakerUpdated': 'Reproduktor aktualizovaný',
  'settings.speakers': 'Reproduktory',
  'settings.stopTest': 'Zastaviť test',
  'settings.storageSubtitle': 'Spravujte lokálne údaje a sťahovania',
  'settings.suspended': 'Pozastavené',
  'settings.testCamera': 'Testovať kameru',
  'settings.testMic': 'Testovať mikrofón',
  'settings.textToSpeech': 'Text na reč',
  'settings.textToSpeechDesc': 'Čítať správy nahlas',
  'settings.topics': 'Témy',
  'settings.tradeCryptocurrencyPrivately': 'Obchodovať s kryptomenami súkromne',
  'settings.typingIndicators': 'Indikátory písania',
  'settings.typingIndicatorsDesc': 'Povoliť ostatným vidieť, keď píšete',
  'settings.usedOf': 'použité z',
  'settings.videoQuality_auto': 'Automatická',
  'settings.videoQuality_high': 'Vysoká',
  'settings.videoQuality_low': 'Nízka',
  'settings.videoQuality_medium': 'Stredná',
  'settings.yourIdentity': 'Vaša identita',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'sk') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (skTranslations[key]) {
    const newValue = skTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Slovak translations.`)
