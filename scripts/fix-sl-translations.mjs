import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const slTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Naloži fotografijo',
  'avatar.cropAvatar': 'Obreži avatar',
  'avatar.cancel': 'Prekliči',
  'avatar.cropSave': 'Obreži in shrani',

  // ─── calls ───
  'calls.openChat': 'Klepet',
  'calls.refreshServer': 'Osveži povezavo s strežnikom',
  'calls.noContactsFound': 'Stikov ni bilo mogoče najti',
  'calls.startCallHint': 'Začnite klic s seznama stikov',

  // ─── common ───
  'common.admin': 'Skrbnik',

  // ─── contacts ───
  'contacts.reloadContacts': 'Ponovno naloži stike iz shrambe Hyperbee',
  'contacts.displayNameOptional': 'Prikazano ime (izbirno)',
  'contacts.displayNamePlaceholder': 'Kako naj se prikažejo?',
  'contacts.selectContact': 'Izberite stik za ogled podrobnosti',
  'contacts.noBlockedContacts': 'Ni blokiranih stikov',
  'contacts.noContactsFound': 'Stikov ni bilo mogoče najti',
  'contacts.error.publicKeyRequired': 'Vnesite javni ključ',
  'contacts.error.invalidPublicKey': 'Neveljavna oblika javnega ključa',
  'contacts.error.noIdentity': 'Identiteta ni na voljo',
  'contacts.error.noContactsFound': 'Stikov ni bilo mogoče najti v shrambi Hyperbee',
  'contacts.error.failedToReload': 'Ponovno nalaganje stikov ni uspelo',

  // ─── groups ───
  'groups.admins': 'Skrbniki',
  'groups.groups': 'Skupine',
  'groups.create': 'Ustvari',
  'groups.searchGroups': 'Išči skupine…',
  'groups.noGroupsFound': 'Skupin ni bilo mogoče najti',
  'groups.noGroupsYet': 'Še ni skupin',
  'groups.createGroupHint': 'Ustvarite skupino za začetek sodelovanja',
  'groups.createFirstGroup': 'Ustvarite svojo prvo skupino',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Prekliči odgovor',
  'messageInput.attachFile': 'Pripni datoteko',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Pošlji sporočilo',
  'messageInput.dropFiles': 'Spustite datoteke sem',
  'messageInput.replyingTo': 'Odgovarjanje na',
  'messageInput.messageDeleted': 'Sporočilo izbrisano',

  // ─── modal ───
  'modal.addContact': 'Dodaj stik',
  'modal.publicKey': 'Javni ključ',
  'modal.publicKeyPlaceholder': 'Vnesite javni ključ stika…',
  'modal.displayName': 'Prikazano ime (izbirno)',
  'modal.displayNamePlaceholder': 'Poimenujte ta stik…',
  'modal.cancel': 'Prekliči',
  'modal.add': 'Dodaj',
  'modal.shareKey': 'Delite svoj javni ključ s svojim stikom, da vas lahko tudi oni dodajo. Najdete ga v Nastavitve → Profil.',
  'modal.error.publicKeyRequired': 'Javni ključ je obvezen',
  'modal.error.publicKeyTooShort': 'Javni ključ je prekratek',
  'modal.error.contactExists': 'Stik že obstaja',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Pomanjšaj',
  'titlebar.maximize': 'Povečaj',
  'titlebar.close': 'Zapri',

  // ─── toast ───
  'toast.dismiss': 'Zapri',
  'toast.dataImported': 'Podatki uspešno uvoženi',
  'toast.importFailed': 'Uvoz ni uspel',
  'toast.invalidBackupFile': 'Neveljavna datoteka varnostne kopije',
  'toast.cacheCleared': 'Predpomnilnik počiščen',
  'toast.failedToClearCache': 'Čiščenje predpomnilnika ni uspelo',
  'toast.permissionGranted': 'Dovoljenje odobreno',
  'toast.permissionDenied': 'Dovoljenje zavrnjeno',
  'toast.microphoneUpdated': 'Mikrofon posodobljen',
  'toast.cameraUpdated': 'Kamera posodobljena',
  'toast.speakerUpdated': 'Zvočnik posodobljen',
  'toast.cameraTestFailed': 'Test kamere ni uspel',
  'toast.addressCopied': 'Naslov kopiran v odložišče',
  'toast.failedToCopyAddress': 'Kopiranje naslova ni uspelo',
  'toast.contactAdded': 'Stik dodan — zaznavanje zagnano',
  'toast.failedToAddContact': 'Dodajanje stika ni uspelo',

  // ─── settings ───
  'settings.audio': 'Zvok',
  'settings.fileType_audio': 'Zvok',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Različica {{version}}',
  'settings.accessibilitySubtitle': 'Naredite Asgard bolj dostopen za vas',
  'settings.atTheFollowingAddress': 'na naslednjem naslovu:',
  'settings.audioQuality_high': 'Visoka',
  'settings.audioQuality_low': 'Nizka',
  'settings.audioQuality_medium': 'Srednja',
  'settings.autoDownload': 'Samodejni prenos',
  'settings.autoDownloadAudioDesc': 'Samodejno prenesi zvočna sporočila',
  'settings.autoDownloadImagesDesc': 'Samodejno prenesi slike',
  'settings.autoDownloadVideosDesc': 'Samodejno prenesi videoposnetke',
  'settings.autoEmoji': 'Samodejni emojiji',
  'settings.autoEmojiDesc': 'Pretvori bližnjice besedila, kot je :) v emojije',
  'settings.autoPlayGifs': 'Samodejno predvajaj GIF-e',
  'settings.autoPlayGifsDesc': 'Samodejno animiraj slike GIF',
  'settings.autoPlayVideos': 'Samodejno predvajaj videoposnetke',
  'settings.autoPlayVideosDesc': 'Samodejno predvajaj videoposnetke, ko so vidni',
  'settings.bandwidth': 'Pasovna širina',
  'settings.batterySaver': 'Varčevanje z baterijo',
  'settings.batterySaverDesc': 'Zaustavi P2P, ko je aplikacija v ozadju',
  'settings.builtWith': 'Zgrajeno z: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Test kamere ni uspel',
  'settings.cameraUpdated': 'Kamera posodobljena',
  'settings.cameras': 'Kamere',
  'settings.chatDensity_comfortable': 'Udobno',
  'settings.chatDensity_compact': 'Kompaktno',
  'settings.chatDensity_cozy': 'Udobno',
  'settings.chatSubtitle': 'Konfigurirajte svojo izkušnjo klepeta',
  'settings.clearCache': 'Počisti predpomnilnik',
  'settings.clickToCopy': 'Kliknite za kopiranje',
  'settings.collapseMessages': 'Strni sporočila',
  'settings.collapseMessagesDesc': 'Združi zaporedna sporočila istega pošiljatelja',
  'settings.compressImages': 'Stisni slike',
  'settings.compressImagesDesc': 'Stisni slike pred pošiljanjem',
  'settings.compressVideos': 'Stisni videoposnetke',
  'settings.compressVideosDesc': 'Stisni videoposnetke pred pošiljanjem za zmanjšanje porabe podatkov',
  'settings.connected': 'Povezano',
  'settings.connecting': 'Povezovanje',
  'settings.connectionStatus': 'Stanje povezave',
  'settings.copied': 'Kopirano!',
  'settings.copyToClipboard': 'Kopiraj v odložišče',
  'settings.defaultAudioQuality': 'Privzeta kakovost zvoka',
  'settings.defaultSpeaker': 'Privzeti zvočnik',
  'settings.defaultVideoQuality': 'Privzeta kakovost videa',
  'settings.detectedHardware': 'Zaznana strojna oprema',
  'settings.devicesAreAutoDetected': 'Naprave se samodejno zaznajo. Spremembe se uporabijo v realnem času.',
  'settings.disconnected': 'Prekinjeno',
  'settings.doNotDisturb': 'Ne moti',
  'settings.doNotDisturbDesc': 'Zatri vsa obvestila',
  'settings.doYouLikeAsgard': 'Vam je všeč aplikacija Asgard?',
  'settings.donationIn': 'Donirajte v',
  'settings.enableNotifications': 'Omogoči obvestila',
  'settings.enableNotificationsDesc': 'Prikaži obvestila Windows za nova sporočila',
  'settings.enableRelay': 'Omogoči rele',
  'settings.enableRelayDesc': 'Uporabi slepe releje, ko neposredne povezave niso na voljo',
  'settings.exportData': 'Izvozi podatke',
  'settings.flushDht': 'Izprazni DHT',
  'settings.grantPermission': 'Odobri dovoljenje',
  'settings.grantPermissionDesc': 'Odobrite dovoljenje za ogled imen naprav in konfiguracijo strojne opreme.',
  'settings.hideRecoveryPhrase': 'Skrij frazo za obnovitev',
  'settings.highContrast': 'Visok kontrast',
  'settings.highContrastDesc': 'Povečaj kontrast za boljšo vidljivost',
  'settings.importData': 'Uvozi podatke',
  'settings.inlinePreviews': 'Vgrajeni predogledi',
  'settings.inlinePreviewsDesc': 'Prikaži predoglede slik neposredno v klepetu',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Krmarjenje s tipkovnico',
  'settings.keyboardNavigationDesc': 'Prikaži bližnjice tipkovnice in indikatorje fokusa',
  'settings.largerTouchTargets': 'Večji dotikalni cilji',
  'settings.largerTouchTargetsDesc': 'Naredite gumbe in interaktivne elemente lažje za dotik',
  'settings.linkPreviews': 'Predogledi povezav',
  'settings.linkPreviewsDesc': 'Samodejno pridobi in prikaži predoglede povezav (lahko razkrije vašo dejavnost brskanja)',
  'settings.localCache': 'Lokalni predpomnilnik',
  'settings.manageTrash': 'Upravljaj koš',
  'settings.maxPeers': 'Največje število vrstnikov',
  'settings.mbLimit': 'Omejitev MB',
  'settings.mediaSubtitle': 'Konfigurirajte predvajanje in stiskanje medijev',
  'settings.mentionsOnly': 'Samo omembe',
  'settings.mentionsOnlyDesc': 'Obveščaj samo o omembah in neposrednih sporočilih',
  'settings.messageDensity': 'Gostota sporočil',
  'settings.messagePreview': 'Predogled sporočila',
  'settings.messagePreviewDesc': 'Prikaži vsebino sporočila v obvestilih',
  'settings.microphone': 'Mikrofon',
  'settings.microphoneAccess': 'Dostop do mikrofona in kamere',
  'settings.microphoneUpdated': 'Mikrofon posodobljen',
  'settings.microphones': 'Mikrofoni',
  'settings.muteByDefault': 'Privzeto utišano',
  'settings.muteByDefaultDesc': 'Zaženi videoposnetke v utišanem načinu',
  'settings.networkSubtitle': 'Nastavitve povezave P2P',
  'settings.neverShareRecoveryPhrase': 'Nikoli ne delite svoje fraze za obnovitev!',
  'settings.new': 'Novo',
  'settings.notAvailable': 'Ni na voljo',
  'settings.notificationSoundDesc': 'Predvajaj zvok za nova sporočila',
  'settings.onlineStatus': 'Spletno stanje',
  'settings.onlineStatusDesc': 'Dovolite svojim stikom, da vidijo vaše spletno stanje',
  'settings.peerLatency': 'Zakasnitev vrstnikov',
  'settings.peerQuality': 'Kakovost vrstnikov',
  'settings.peers': 'Vrstniki',
  'settings.readReceipts': 'Potrdila o branju',
  'settings.readReceiptsDesc': 'Obvestite druge, ko preberete njihova sporočila',
  'settings.recoveryPhrase': 'Fraza za obnovitev',
  'settings.recoveryPhraseDesc': 'Vaša 24-besedna fraza za obnovitev se lahko uporabi za obnovitev vaše identitete na drugi napravi. Shranite jo na varnem in je nikoli ne delite.',
  'settings.recoveryPhraseWarning': 'Vsakdo s temi besedami lahko dostopa do vašega računa.',
  'settings.reducedMotion': 'Zmanjšaj animacije',
  'settings.reducedMotionDesc': 'Zmanjšaj animacije in prehode',
  'settings.screenReaderOptimizations': 'Optimizacije bralnika zaslona',
  'settings.screenReaderOptimizationsDesc': 'Izboljšana podpora za bralnike zaslona',
  'settings.securitySubtitle': 'Upravljajte svojo identiteto in frazo za obnovitev',
  'settings.sendOnEnter': 'Pošlji z Enter',
  'settings.sendOnEnterDesc': 'Pritisnite Enter za pošiljanje, Shift+Enter za novo vrstico',
  'settings.showReadStatus': 'Prikaži stanje branja',
  'settings.showReadStatusDesc': 'Prikaži potrdila o branju na poslanih sporočilih',
  'settings.showRecoveryPhrase': 'Prikaži frazo za obnovitev',
  'settings.showSeconds': 'Prikaži sekunde',
  'settings.showSecondsDesc': 'Vključi sekunde v časovne žige',
  'settings.showTimestamps': 'Prikaži časovne žige',
  'settings.showTimestampsDesc': 'Prikaži čas ob vsakem sporočilu',
  'settings.showVideoControls': 'Prikaži kontrolnike videa',
  'settings.showVideoControlsDesc': 'Prikaži kontrolnike predvajanja na videoposnetkih',
  'settings.speaker': 'Zvočnik',
  'settings.speakerUpdated': 'Zvočnik posodobljen',
  'settings.speakers': 'Zvočniki',
  'settings.stopTest': 'Ustavi test',
  'settings.storageSubtitle': 'Upravljajte lokalne podatke in prenose',
  'settings.suspended': 'Zaustavljeno',
  'settings.testCamera': 'Testiraj kamero',
  'settings.testMic': 'Testiraj mikrofon',
  'settings.textToSpeech': 'Besedilo v govor',
  'settings.textToSpeechDesc': 'Preberi sporočila na glas',
  'settings.topics': 'Teme',
  'settings.tradeCryptocurrencyPrivately': 'Trgujte s kriptovalutami zasebno',
  'settings.typingIndicators': 'Indikatorji tipkanja',
  'settings.typingIndicatorsDesc': 'Dovolite drugim, da vidijo, ko tipkate',
  'settings.usedOf': 'porabljeno od',
  'settings.videoQuality_auto': 'Samodejno',
  'settings.videoQuality_high': 'Visoka',
  'settings.videoQuality_low': 'Nizka',
  'settings.videoQuality_medium': 'Srednja',
  'settings.yourIdentity': 'Vaša identiteta',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'sl') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (slTranslations[key]) {
    const newValue = slTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Slovenian translations.`)
