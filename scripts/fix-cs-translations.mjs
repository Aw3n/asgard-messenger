import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const csTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Nahrát fotku',
  'avatar.cropAvatar': 'Oříznout avatar',
  'avatar.cancel': 'Zrušit',
  'avatar.cropSave': 'Oříznout a uložit',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Obnovit připojení k serveru',
  'calls.noContactsFound': 'Kontakty nebyly nalezeny',
  'calls.startCallHint': 'Spusťte hovor ze seznamu kontaktů',

  // ─── common ───
  'common.admin': 'Správce',

  // ─── contacts ───
  'contacts.reloadContacts': 'Znovu načíst kontakty z úložiště Hyperbee',
  'contacts.displayNameOptional': 'Zobrazované jméno (volitelné)',
  'contacts.displayNamePlaceholder': 'Jak by se měli zobrazovat?',
  'contacts.selectContact': 'Vyberte kontakt pro zobrazení podrobností',
  'contacts.noBlockedContacts': 'Žádné zablokované kontakty',
  'contacts.noContactsFound': 'Kontakty nebyly nalezeny',
  'contacts.error.publicKeyRequired': 'Zadejte veřejný klíč',
  'contacts.error.invalidPublicKey': 'Neplatný formát veřejného klíče',
  'contacts.error.noIdentity': 'Identita není k dispozici',
  'contacts.error.noContactsFound': 'Kontakty nebyly nalezeny v úložišti Hyperbee',
  'contacts.error.failedToReload': 'Nepodařilo se znovu načíst kontakty',

  // ─── groups ───
  'groups.admins': 'Správci',
  'groups.groups': 'Skupiny',
  'groups.create': 'Vytvořit',
  'groups.searchGroups': 'Hledat skupiny…',
  'groups.noGroupsFound': 'Skupiny nebyly nalezeny',
  'groups.noGroupsYet': 'Zatím žádné skupiny',
  'groups.createGroupHint': 'Vytvořte skupinu pro zahájení spolupráce',
  'groups.createFirstGroup': 'Vytvořte svou první skupinu',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Zrušit odpověď',
  'messageInput.attachFile': 'Připojit soubor',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Odeslat zprávu',
  'messageInput.dropFiles': 'Přetáhněte soubory sem',
  'messageInput.replyingTo': 'Odpovídání na',
  'messageInput.messageDeleted': 'Zpráva smazána',

  // ─── modal ───
  'modal.addContact': 'Přidat kontakt',
  'modal.publicKey': 'Veřejný klíč',
  'modal.publicKeyPlaceholder': 'Zadejte veřejný klíč kontaktu…',
  'modal.displayName': 'Zobrazované jméno (volitelné)',
  'modal.displayNamePlaceholder': 'Pojmenujte tento kontakt…',
  'modal.cancel': 'Zrušit',
  'modal.add': 'Přidat',
  'modal.shareKey': 'Sdílejte svůj veřejný klíč s kontaktem, aby vás také mohl přidat. Najdete ho v Nastavení → Profil.',
  'modal.error.publicKeyRequired': 'Veřejný klíč je povinný',
  'modal.error.publicKeyTooShort': 'Veřejný klíč je příliš krátký',
  'modal.error.contactExists': 'Kontakt již existuje',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimalizovat',
  'titlebar.maximize': 'Maximalizovat',
  'titlebar.close': 'Zavřít',

  // ─── toast ───
  'toast.dismiss': 'Zavřít',
  'toast.dataImported': 'Data úspěšně importována',
  'toast.importFailed': 'Importování selhalo',
  'toast.invalidBackupFile': 'Neplatný soubor zálohy',
  'toast.cacheCleared': 'Mezipaměť vymazána',
  'toast.failedToClearCache': 'Vymazání mezipaměti selhalo',
  'toast.permissionGranted': 'Oprávnění uděleno',
  'toast.permissionDenied': 'Oprávnění zamítnuto',
  'toast.microphoneUpdated': 'Mikrofon aktualizován',
  'toast.cameraUpdated': 'Kamera aktualizována',
  'toast.speakerUpdated': 'Reproduktor aktualizován',
  'toast.cameraTestFailed': 'Test kamery selhal',
  'toast.addressCopied': 'Adresa zkopírována do schránky',
  'toast.failedToCopyAddress': 'Kopírování adresy selhalo',
  'toast.contactAdded': 'Kontakt přidán — vyhledávání spuštěno',
  'toast.failedToAddContact': 'Přidání kontaktu selhalo',

  // ─── settings ───
  'settings.audio': 'Zvuk',
  'settings.fileType_audio': 'Zvuk',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Verze {{version}}',
  'settings.accessibilitySubtitle': 'Udělejte Asgard přístupnějším pro vás',
  'settings.atTheFollowingAddress': 'na následující adrese:',
  'settings.audioQuality_high': 'Vysoká',
  'settings.audioQuality_low': 'Nízká',
  'settings.audioQuality_medium': 'Střední',
  'settings.autoDownload': 'Automatické stahování',
  'settings.autoDownloadAudioDesc': 'Automaticky stahovat zvukové zprávy',
  'settings.autoDownloadImagesDesc': 'Automaticky stahovat obrázky',
  'settings.autoDownloadVideosDesc': 'Automaticky stahovat videa',
  'settings.autoEmoji': 'Automatické emoji',
  'settings.autoEmojiDesc': 'Převádět textové zkratky jako :) na emoji',
  'settings.autoPlayGifs': 'Automaticky přehrávat GIFy',
  'settings.autoPlayGifsDesc': 'Automaticky animovat GIF obrázky',
  'settings.autoPlayVideos': 'Automaticky přehrávat videa',
  'settings.autoPlayVideosDesc': 'Automaticky přehrávat videa, když jsou viditelná',
  'settings.bandwidth': 'Šířka pásma',
  'settings.batterySaver': 'Úspora baterie',
  'settings.batterySaverDesc': 'Pozastavit P2P, když je aplikace na pozadí',
  'settings.builtWith': 'Vytvořeno s: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Test kamery selhal',
  'settings.cameraUpdated': 'Kamera aktualizována',
  'settings.cameras': 'Kamery',
  'settings.chatDensity_comfortable': 'Pohodlná',
  'settings.chatDensity_compact': 'Kompaktní',
  'settings.chatDensity_cozy': 'Pohodlná',
  'settings.chatSubtitle': 'Konfigurujte své chatové prostředí',
  'settings.clearCache': 'Vymazat mezipaměť',
  'settings.clickToCopy': 'Kliknutím zkopírujte',
  'settings.collapseMessages': 'Sbalit zprávy',
  'settings.collapseMessagesDesc': 'Seskupit po sobě jdoucí zprávy od stejného odesílatele',
  'settings.compressImages': 'Komprimovat obrázky',
  'settings.compressImagesDesc': 'Komprimovat obrázky před odesláním',
  'settings.compressVideos': 'Komprimovat videa',
  'settings.compressVideosDesc': 'Komprimovat videa před odesláním pro snížení spotřeby dat',
  'settings.connected': 'Připojeno',
  'settings.connecting': 'Připojování',
  'settings.connectionStatus': 'Stav připojení',
  'settings.copied': 'Zkopírováno!',
  'settings.copyToClipboard': 'Kopírovat do schránky',
  'settings.defaultAudioQuality': 'Výchozí kvalita zvuku',
  'settings.defaultSpeaker': 'Výchozí reproduktor',
  'settings.defaultVideoQuality': 'Výchozí kvalita videa',
  'settings.detectedHardware': 'Rozpoznaný hardware',
  'settings.devicesAreAutoDetected': 'Zařízení se rozpoznávají automaticky. Změny se aplikují v reálném čase.',
  'settings.disconnected': 'Odpojeno',
  'settings.doNotDisturb': 'Nerušit',
  'settings.doNotDisturbDesc': 'Potlačit všechna upozornění',
  'settings.doYouLikeAsgard': 'Líbí se vám aplikace Asgard?',
  'settings.donationIn': 'Přispět',
  'settings.enableNotifications': 'Povolit upozornění',
  'settings.enableNotificationsDesc': 'Zobrazit upozornění Windows pro nové zprávy',
  'settings.enableRelay': 'Povolit přenos',
  'settings.enableRelayDesc': 'Používat slepé přenosy, když přímá připojení nejsou k dispozici',
  'settings.exportData': 'Exportovat data',
  'settings.flushDht': 'Vyprázdnit DHT',
  'settings.grantPermission': 'Udělit oprávnění',
  'settings.grantPermissionDesc': 'Udělte oprávnění pro zobrazení názvů zařízení a konfiguraci hardwaru.',
  'settings.hideRecoveryPhrase': 'Skrýt frázi k obnovení',
  'settings.highContrast': 'Vysoký kontrast',
  'settings.highContrastDesc': 'Zvýšit kontrast pro lepší viditelnost',
  'settings.importData': 'Importovat data',
  'settings.inlinePreviews': 'Vestavěné náhledy',
  'settings.inlinePreviewsDesc': 'Zobrazovat náhledy obrázků přímo v chatu',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Navigace klávesnicí',
  'settings.keyboardNavigationDesc': 'Zobrazit klávesové zkratky a indikátory fokusu',
  'settings.largerTouchTargets': 'Větší dotykové cíle',
  'settings.largerTouchTargetsDesc': 'Udělat tlačítka a interaktivní prvky snadněji dotknutelné',
  'settings.linkPreviews': 'Náhledy odkazů',
  'settings.linkPreviewsDesc': 'Automaticky získávat a zobrazovat náhledy odkazů (může odhalit vaši aktivitu procházení)',
  'settings.localCache': 'Místní mezipaměť',
  'settings.manageTrash': 'Spravovat koš',
  'settings.maxPeers': 'Maximální počet peerů',
  'settings.mbLimit': 'Limit MB',
  'settings.mediaSubtitle': 'Konfigurujte přehrávání a kompresi médií',
  'settings.mentionsOnly': 'Pouze zmínky',
  'settings.mentionsOnlyDesc': 'Upozorňovat pouze na zmínky a přímé zprávy',
  'settings.messageDensity': 'Hustota zpráv',
  'settings.messagePreview': 'Náhled zprávy',
  'settings.messagePreviewDesc': 'Zobrazovat obsah zprávy v upozorněních',
  'settings.microphone': 'Mikrofon',
  'settings.microphoneAccess': 'Přístup k mikrofonu a kameře',
  'settings.microphoneUpdated': 'Mikrofon aktualizován',
  'settings.microphones': 'Mikrofony',
  'settings.muteByDefault': 'Ve výchozím nastavení ztlumeno',
  'settings.muteByDefaultDesc': 'Spouštět videa v tichém režimu',
  'settings.networkSubtitle': 'Nastavení připojení P2P',
  'settings.neverShareRecoveryPhrase': 'Nikdy nesdílejte svou frázi k obnovení!',
  'settings.new': 'Nový',
  'settings.notAvailable': 'Nedostupné',
  'settings.notificationSoundDesc': 'Přehrát zvuk pro nové zprávy',
  'settings.onlineStatus': 'Online stav',
  'settings.onlineStatusDesc': 'Povolit kontaktům vidět váš online stav',
  'settings.peerLatency': 'Latence peerů',
  'settings.peerQuality': 'Kvalita peerů',
  'settings.peers': 'Peery',
  'settings.readReceipts': 'Potvrzení o přečtení',
  'settings.readReceiptsDesc': 'Informovat ostatní, když přečtete jejich zprávy',
  'settings.recoveryPhrase': 'Fráze k obnovení',
  'settings.recoveryPhraseDesc': 'Vaše 24-slovná fráze k obnovení může být použita k obnovení vaší identity na jiném zařízení. Uchovávejte ji bezpečně a nikdy ji nesdílejte.',
  'settings.recoveryPhraseWarning': 'Kdokoli s těmito slovy může získat přístup k vašemu účtu.',
  'settings.reducedMotion': 'Snížit animace',
  'settings.reducedMotionDesc': 'Minimalizovat animace a přechody',
  'settings.screenReaderOptimizations': 'Optimalizace čtečky obrazovky',
  'settings.screenReaderOptimizationsDesc': 'Vylepšená podpora pro čtečky obrazovky',
  'settings.securitySubtitle': 'Spravujte svou identitu a frázi k obnovení',
  'settings.sendOnEnter': 'Odeslat klávesou Enter',
  'settings.sendOnEnterDesc': 'Stiskněte Enter pro odeslání, Shift+Enter pro nový řádek',
  'settings.showReadStatus': 'Zobrazit stav čtení',
  'settings.showReadStatusDesc': 'Zobrazit potvrzení o přečtení na odeslaných zprávách',
  'settings.showRecoveryPhrase': 'Zobrazit frázi k obnovení',
  'settings.showSeconds': 'Zobrazit sekundy',
  'settings.showSecondsDesc': 'Zahrnout sekundy do časových razítek',
  'settings.showTimestamps': 'Zobrazit časová razítka',
  'settings.showTimestampsDesc': 'Zobrazit čas vedle každé zprávy',
  'settings.showVideoControls': 'Zobrazit ovládací prvky videa',
  'settings.showVideoControlsDesc': 'Zobrazit ovládací prvky přehrávání na videích',
  'settings.speaker': 'Reproduktor',
  'settings.speakerUpdated': 'Reproduktor aktualizován',
  'settings.speakers': 'Reproduktory',
  'settings.stopTest': 'Zastavit test',
  'settings.storageSubtitle': 'Spravujte místní data a stahování',
  'settings.suspended': 'Pozastaveno',
  'settings.testCamera': 'Testovat kameru',
  'settings.testMic': 'Testovat mikrofon',
  'settings.textToSpeech': 'Text na řeč',
  'settings.textToSpeechDesc': 'Číst zprávy nahlas',
  'settings.topics': 'Témata',
  'settings.tradeCryptocurrencyPrivately': 'Obchodovat s kryptoměnami soukromě',
  'settings.typingIndicators': 'Indikátory psaní',
  'settings.typingIndicatorsDesc': 'Povolit ostatním vidět, když píšete',
  'settings.usedOf': 'použito z',
  'settings.videoQuality_auto': 'Automatická',
  'settings.videoQuality_high': 'Vysoká',
  'settings.videoQuality_low': 'Nízká',
  'settings.videoQuality_medium': 'Střední',
  'settings.yourIdentity': 'Vaše identita',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'cs') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (csTranslations[key]) {
    const newValue = csTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Czech translations.`)
