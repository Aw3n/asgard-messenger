import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const hrTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Učitaj fotografiju',
  'avatar.cropAvatar': 'Obreži avatar',
  'avatar.cancel': 'Odustani',
  'avatar.cropSave': 'Obreži i spremi',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Osvježi vezu s poslužiteljem',
  'calls.noContactsFound': 'Kontakti nisu pronađeni',
  'calls.startCallHint': 'Pokrenite poziv s popisa kontakata',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Ponovno učitaj kontakte iz Hyperbee pohrane',
  'contacts.displayNameOptional': 'Prikazano ime (neobavezno)',
  'contacts.displayNamePlaceholder': 'Kako bi se trebali prikazivati?',
  'contacts.selectContact': 'Odaberite kontakt za pregled detalja',
  'contacts.noBlockedContacts': 'Nema blokiranih kontakata',
  'contacts.noContactsFound': 'Kontakti nisu pronađeni',
  'contacts.error.publicKeyRequired': 'Unesite javni ključ',
  'contacts.error.invalidPublicKey': 'Nevažeći format javnog ključa',
  'contacts.error.noIdentity': 'Identitet nije dostupan',
  'contacts.error.noContactsFound': 'Kontakti nisu pronađeni u Hyperbee pohrani',
  'contacts.error.failedToReload': 'Ponovno učitavanje kontakata nije uspjelo',

  // ─── groups ───
  'groups.admins': 'Administratori',
  'groups.groups': 'Grupe',
  'groups.create': 'Stvori',
  'groups.searchGroups': 'Pretraži grupe…',
  'groups.noGroupsFound': 'Grupe nisu pronađene',
  'groups.noGroupsYet': 'Još nema grupa',
  'groups.createGroupHint': 'Stvorite grupu za početak suradnje',
  'groups.createFirstGroup': 'Stvorite svoju prvu grupu',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Odustani od odgovora',
  'messageInput.attachFile': 'Priloži datoteku',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Pošalji poruku',
  'messageInput.dropFiles': 'Ispustite datoteke ovdje',
  'messageInput.replyingTo': 'Odgovaranje na',
  'messageInput.messageDeleted': 'Poruka obrisana',

  // ─── modal ───
  'modal.addContact': 'Dodaj kontakt',
  'modal.publicKey': 'Javni ključ',
  'modal.publicKeyPlaceholder': 'Unesite javni ključ kontakta…',
  'modal.displayName': 'Prikazano ime (neobavezno)',
  'modal.displayNamePlaceholder': 'Dajte ovom kontaktu ime…',
  'modal.cancel': 'Odustani',
  'modal.add': 'Dodaj',
  'modal.shareKey': 'Podijelite svoj javni ključ s kontaktom kako bi vas i oni mogli dodati. Pronaći ćete ga u Postavke → Profil.',
  'modal.error.publicKeyRequired': 'Javni ključ je obavezan',
  'modal.error.publicKeyTooShort': 'Javni ključ je prekratak',
  'modal.error.contactExists': 'Kontakt već postoji',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Smanji',
  'titlebar.maximize': 'Povećaj',
  'titlebar.close': 'Zatvori',

  // ─── toast ───
  'toast.dismiss': 'Zatvori',
  'toast.dataImported': 'Podaci uspješno uvezeni',
  'toast.importFailed': 'Uvoz nije uspio',
  'toast.invalidBackupFile': 'Nevažeća datoteka sigurnosne kopije',
  'toast.cacheCleared': 'Predmemorija očišćena',
  'toast.failedToClearCache': 'Čišćenje predmemorije nije uspjelo',
  'toast.permissionGranted': 'Dopuštenje odobreno',
  'toast.permissionDenied': 'Dopuštenje odbijeno',
  'toast.microphoneUpdated': 'Mikrofon ažuriran',
  'toast.cameraUpdated': 'Kamera ažurirana',
  'toast.speakerUpdated': 'Zvučnik ažuriran',
  'toast.cameraTestFailed': 'Test kamere nije uspio',
  'toast.addressCopied': 'Adresa kopirana u međuspremnik',
  'toast.failedToCopyAddress': 'Kopiranje adrese nije uspjelo',
  'toast.contactAdded': 'Kontakt dodan — otkrivanje pokrenuto',
  'toast.failedToAddContact': 'Dodavanje kontakta nije uspjelo',

  // ─── settings ───
  'settings.audio': 'Zvuk',
  'settings.fileType_audio': 'Zvuk',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Verzija {{version}}',
  'settings.accessibilitySubtitle': 'Učinite Asgard pristupačnijim za vas',
  'settings.atTheFollowingAddress': 'na sljedećoj adresi:',
  'settings.audioQuality_high': 'Visoka',
  'settings.audioQuality_low': 'Niska',
  'settings.audioQuality_medium': 'Srednja',
  'settings.autoDownload': 'Automatsko preuzimanje',
  'settings.autoDownloadAudioDesc': 'Automatski preuzmi zvučne poruke',
  'settings.autoDownloadImagesDesc': 'Automatski preuzmi slike',
  'settings.autoDownloadVideosDesc': 'Automatski preuzmi videozapise',
  'settings.autoEmoji': 'Automatski emoji',
  'settings.autoEmojiDesc': 'Pretvori tekstovne prečace poput :) u emoji',
  'settings.autoPlayGifs': 'Automatski reproduciraj GIF-ove',
  'settings.autoPlayGifsDesc': 'Automatski animiraj GIF slike',
  'settings.autoPlayVideos': 'Automatski reproduciraj videozapise',
  'settings.autoPlayVideosDesc': 'Automatski reproduciraj videozapise kada su vidljivi',
  'settings.bandwidth': 'Propusnost',
  'settings.batterySaver': 'Ušteda baterije',
  'settings.batterySaverDesc': 'Obustavi P2P kada je aplikacija u pozadini',
  'settings.builtWith': 'Izgrađeno s: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Test kamere nije uspio',
  'settings.cameraUpdated': 'Kamera ažurirana',
  'settings.cameras': 'Kamere',
  'settings.chatDensity_comfortable': 'Udobno',
  'settings.chatDensity_compact': 'Kompaktno',
  'settings.chatDensity_cozy': 'Udobno',
  'settings.chatSubtitle': 'Konfigurirajte svoje iskustvo chatanja',
  'settings.clearCache': 'Očisti predmemoriju',
  'settings.clickToCopy': 'Kliknite za kopiranje',
  'settings.collapseMessages': 'Sažmi poruke',
  'settings.collapseMessagesDesc': 'Grupiraj uzastopne poruke istog pošiljatelja',
  'settings.compressImages': 'Komprimiraj slike',
  'settings.compressImagesDesc': 'Komprimiraj slike prije slanja',
  'settings.compressVideos': 'Komprimiraj videozapise',
  'settings.compressVideosDesc': 'Komprimiraj videozapise prije slanja za smanjenje potrošnje podataka',
  'settings.connected': 'Povezano',
  'settings.connecting': 'Povezivanje',
  'settings.connectionStatus': 'Status veze',
  'settings.copied': 'Kopirano!',
  'settings.copyToClipboard': 'Kopiraj u međuspremnik',
  'settings.defaultAudioQuality': 'Zadana kvaliteta zvuka',
  'settings.defaultSpeaker': 'Zadani zvučnik',
  'settings.defaultVideoQuality': 'Zadana kvaliteta videa',
  'settings.detectedHardware': 'Otkriveni hardver',
  'settings.devicesAreAutoDetected': 'Uređaji se automatski otkrivaju. Promjene se primjenjuju u stvarnom vremenu.',
  'settings.disconnected': 'Odspojeno',
  'settings.doNotDisturb': 'Ne ometaj',
  'settings.doNotDisturbDesc': 'Potisni sve obavijesti',
  'settings.doYouLikeAsgard': 'Sviđa vam se aplikacija Asgard?',
  'settings.donationIn': 'Donirajte u',
  'settings.enableNotifications': 'Omogući obavijesti',
  'settings.enableNotificationsDesc': 'Prikaži Windows obavijesti za nove poruke',
  'settings.enableRelay': 'Omogući relej',
  'settings.enableRelayDesc': 'Koristi slijepe releje kada izravne veze nisu dostupne',
  'settings.exportData': 'Izvezi podatke',
  'settings.flushDht': 'Isprazni DHT',
  'settings.grantPermission': 'Odobri dopuštenje',
  'settings.grantPermissionDesc': 'Odobrite dopuštenje za pregled naziva uređaja i konfiguraciju hardvera.',
  'settings.hideRecoveryPhrase': 'Sakrij frazu za oporavak',
  'settings.highContrast': 'Visoki kontrast',
  'settings.highContrastDesc': 'Povećaj kontrast za bolju vidljivost',
  'settings.importData': 'Uvezi podatke',
  'settings.inlinePreviews': 'Ugrađeni pregledi',
  'settings.inlinePreviewsDesc': 'Prikaži preglede slika izravno u chatu',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Navigacija tipkovnicom',
  'settings.keyboardNavigationDesc': 'Prikaži tipkovne prečace i indikatore fokusa',
  'settings.largerTouchTargets': 'Veći dodirni ciljevi',
  'settings.largerTouchTargetsDesc': 'Učinite gumbe i interaktivne elemente lakšima za dodir',
  'settings.linkPreviews': 'Pregledi veza',
  'settings.linkPreviewsDesc': 'Automatski dohvati i prikaži preglede veza (može otkriti vašu aktivnost pregledavanja)',
  'settings.localCache': 'Lokalna predmemorija',
  'settings.manageTrash': 'Upravljanje košaricom',
  'settings.maxPeers': 'Maksimalan broj vršnjaka',
  'settings.mbLimit': 'MB ograničenje',
  'settings.mediaSubtitle': 'Konfigurirajte reprodukciju i kompresiju medija',
  'settings.mentionsOnly': 'Samo spominjanja',
  'settings.mentionsOnlyDesc': 'Obavijesti samo za spominjanja i izravne poruke',
  'settings.messageDensity': 'Gustoća poruka',
  'settings.messagePreview': 'Pregled poruke',
  'settings.messagePreviewDesc': 'Prikaži sadržaj poruke u obavijestima',
  'settings.microphone': 'Mikrofon',
  'settings.microphoneAccess': 'Pristup mikrofonu i kameri',
  'settings.microphoneUpdated': 'Mikrofon ažuriran',
  'settings.microphones': 'Mikrofoni',
  'settings.muteByDefault': 'Zadano isključeno',
  'settings.muteByDefaultDesc': 'Pokreni videozapise u bešumnom načinu',
  'settings.networkSubtitle': 'P2P postavke veze',
  'settings.neverShareRecoveryPhrase': 'Nikada ne dijelite svoju frazu za oporavak!',
  'settings.new': 'Novo',
  'settings.notAvailable': 'Nije dostupno',
  'settings.notificationSoundDesc': 'Reproduciraj zvuk za nove poruke',
  'settings.onlineStatus': 'Online status',
  'settings.onlineStatusDesc': 'Dopustite kontaktima da vide vaš online status',
  'settings.peerLatency': 'Latencija vršnjaka',
  'settings.peerQuality': 'Kvaliteta vršnjaka',
  'settings.peers': 'Vršnjaci',
  'settings.readReceipts': 'Potvrde čitanja',
  'settings.readReceiptsDesc': 'Obavijestite druge kada pročitate njihove poruke',
  'settings.recoveryPhrase': 'Fraza za oporavak',
  'settings.recoveryPhraseDesc': 'Vaša fraza za oporavak od 24 riječi može se koristiti za vraćanje vašeg identiteta na drugom uređaju. Čuvajte je sigurno i nikada je ne dijelite.',
  'settings.recoveryPhraseWarning': 'Svatko s ovim riječima može pristupiti vašem računu.',
  'settings.reducedMotion': 'Smanji animacije',
  'settings.reducedMotionDesc': 'Minimiziraj animacije i prijelaze',
  'settings.screenReaderOptimizations': 'Optimizacije za čitač zaslona',
  'settings.screenReaderOptimizationsDesc': 'Poboljšana podrška za čitače zaslona',
  'settings.securitySubtitle': 'Upravljajte svojim identitetom i frazom za oporavak',
  'settings.sendOnEnter': 'Pošalji s Enter',
  'settings.sendOnEnterDesc': 'Pritisnite Enter za slanje, Shift+Enter za novi red',
  'settings.showReadStatus': 'Prikaži status čitanja',
  'settings.showReadStatusDesc': 'Prikaži potvrde čitanja na poslanim porukama',
  'settings.showRecoveryPhrase': 'Prikaži frazu za oporavak',
  'settings.showSeconds': 'Prikaži sekunde',
  'settings.showSecondsDesc': 'Uključi sekunde u vremenske oznake',
  'settings.showTimestamps': 'Prikaži vremenske oznake',
  'settings.showTimestampsDesc': 'Prikaži vrijeme pored svake poruke',
  'settings.showVideoControls': 'Prikaži video kontrole',
  'settings.showVideoControlsDesc': 'Prikaži kontrole reprodukcije na videozapisima',
  'settings.speaker': 'Zvučnik',
  'settings.speakerUpdated': 'Zvučnik ažuriran',
  'settings.speakers': 'Zvučnici',
  'settings.stopTest': 'Zaustavi test',
  'settings.storageSubtitle': 'Upravljajte lokalnim podacima i preuzimanjima',
  'settings.suspended': 'Obustavljeno',
  'settings.testCamera': 'Testiraj kameru',
  'settings.testMic': 'Testiraj mikrofon',
  'settings.textToSpeech': 'Tekst u govor',
  'settings.textToSpeechDesc': 'Čitaj poruke naglas',
  'settings.topics': 'Teme',
  'settings.tradeCryptocurrencyPrivately': 'Trgujte kriptovalutama privatno',
  'settings.typingIndicators': 'Indikatori tipkanja',
  'settings.typingIndicatorsDesc': 'Dopustite drugima da vide kada tipkate',
  'settings.usedOf': 'korišteno od',
  'settings.videoQuality_auto': 'Automatski',
  'settings.videoQuality_high': 'Visoka',
  'settings.videoQuality_low': 'Niska',
  'settings.videoQuality_medium': 'Srednja',
  'settings.yourIdentity': 'Vaš identitet',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'hr') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (hrTranslations[key]) {
    const newValue = hrTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Croatian translations.`)
