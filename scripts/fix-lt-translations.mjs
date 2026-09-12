import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const ltTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Įkelti nuotrauką',
  'avatar.cropAvatar': 'Apkirpti avatarą',
  'avatar.cancel': 'Atšaukti',
  'avatar.cropSave': 'Apkirpti ir išsaugoti',

  // ─── calls ───
  'calls.openChat': 'Pokalbis',
  'calls.refreshServer': 'Atnaujinti serverio ryšį',
  'calls.noContactsFound': 'Kontaktų nerasta',
  'calls.startCallHint': 'Pradėkite skambutį iš kontaktų sąrašo',

  // ─── common ───
  'common.admin': 'Administratorius',

  // ─── contacts ───
  'contacts.reloadContacts': 'Iš naujo įkelti kontaktus iš Hyperbee saugyklos',
  'contacts.displayNameOptional': 'Rodomas vardas (neprivalomas)',
  'contacts.displayNamePlaceholder': 'Kaip jie turėtų atrodyti?',
  'contacts.selectContact': 'Pasirinkite kontaktą, kad peržiūrėtumėte detales',
  'contacts.noBlockedContacts': 'Nėra užblokuotų kontaktų',
  'contacts.noContactsFound': 'Kontaktų nerasta',
  'contacts.error.publicKeyRequired': 'Įveskite viešąjį raktą',
  'contacts.error.invalidPublicKey': 'Neteisingas viešojo rakto formatas',
  'contacts.error.noIdentity': 'Tapatybė nepasiekiama',
  'contacts.error.noContactsFound': 'Kontaktų nerasta Hyperbee saugykloje',
  'contacts.error.failedToReload': 'Nepavyko iš naujo įkelti kontaktų',

  // ─── groups ───
  'groups.admins': 'Administratoriai',
  'groups.groups': 'Grupės',
  'groups.create': 'Sukurti',
  'groups.searchGroups': 'Ieškoti grupių…',
  'groups.noGroupsFound': 'Grupių nerasta',
  'groups.noGroupsYet': 'Dar nėra grupių',
  'groups.createGroupHint': 'Sukurkite grupę, kad pradėtumėte bendradarbiauti',
  'groups.createFirstGroup': 'Sukurkite savo pirmą grupę',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Atšaukti atsakymą',
  'messageInput.attachFile': 'Pridėti failą',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Siųsti žinutę',
  'messageInput.dropFiles': 'Numeskite failus čia',
  'messageInput.replyingTo': 'Atsakant į',
  'messageInput.messageDeleted': 'Žinutė ištrinta',

  // ─── modal ───
  'modal.addContact': 'Pridėti kontaktą',
  'modal.publicKey': 'Viešasis raktas',
  'modal.publicKeyPlaceholder': 'Įveskite kontakto viešąjį raktą…',
  'modal.displayName': 'Rodomas vardas (neprivalomas)',
  'modal.displayNamePlaceholder': 'Suteikite šiam kontaktui vardą…',
  'modal.cancel': 'Atšaukti',
  'modal.add': 'Pridėti',
  'modal.shareKey': 'Pasidalykite savo viešuoju raktu su savo kontaktu, kad jie taip pat galėtų jus pridėti. Rasite jį Nustatymai → Profilis.',
  'modal.error.publicKeyRequired': 'Viešasis raktas yra privalomas',
  'modal.error.publicKeyTooShort': 'Viešasis raktas yra per trumpas',
  'modal.error.contactExists': 'Kontaktas jau egzistuoja',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Sumažinti',
  'titlebar.maximize': 'Padidinti',
  'titlebar.close': 'Uždaryti',

  // ─── toast ───
  'toast.dismiss': 'Uždaryti',
  'toast.dataImported': 'Duomenys sėkmingai importuoti',
  'toast.importFailed': 'Importavimas nepavyko',
  'toast.invalidBackupFile': 'Neteisingas atsarginės kopijos failas',
  'toast.cacheCleared': 'Talpykla išvalyta',
  'toast.failedToClearCache': 'Talpyklos valymas nepavyko',
  'toast.permissionGranted': 'Leidimas suteiktas',
  'toast.permissionDenied': 'Leidimas atmestas',
  'toast.microphoneUpdated': 'Mikrofonas atnaujintas',
  'toast.cameraUpdated': 'Kamera atnaujinta',
  'toast.speakerUpdated': 'Garsiakalbis atnaujintas',
  'toast.cameraTestFailed': 'Kameros testas nepavyko',
  'toast.addressCopied': 'Adresas nukopijuotas į iškarpinę',
  'toast.failedToCopyAddress': 'Nepavyko nukopijuoti adreso',
  'toast.contactAdded': 'Kontaktas pridėtas — aptikimas pradėtas',
  'toast.failedToAddContact': 'Nepavyko pridėti kontakto',

  // ─── settings ───
  'settings.audio': 'Garsas',
  'settings.fileType_audio': 'Garsas',
  'settings.profile': 'Profilis',
  'settings.appVersion': 'Versija {{version}}',
  'settings.accessibilitySubtitle': 'Padarykite Asgard prieinamesnį jums',
  'settings.atTheFollowingAddress': 'šiuo adresu:',
  'settings.audioQuality_high': 'Aukšta',
  'settings.audioQuality_low': 'Žema',
  'settings.audioQuality_medium': 'Vidutinė',
  'settings.autoDownload': 'Automatinis atsisiuntimas',
  'settings.autoDownloadAudioDesc': 'Automatiškai atsisiųsti garso žinutes',
  'settings.autoDownloadImagesDesc': 'Automatiškai atsisiųsti vaizdus',
  'settings.autoDownloadVideosDesc': 'Automatiškai atsisiųsti vaizdo įrašus',
  'settings.autoEmoji': 'Automatiniai emoji',
  'settings.autoEmojiDesc': 'Konvertuoti teksto trumpinius kaip :) į emoji',
  'settings.autoPlayGifs': 'Automatiškai atkurti GIF',
  'settings.autoPlayGifsDesc': 'Automatiškai animuoti GIF vaizdus',
  'settings.autoPlayVideos': 'Automatiškai atkurti vaizdo įrašus',
  'settings.autoPlayVideosDesc': 'Automatiškai atkurti vaizdo įrašus, kai jie matomi',
  'settings.bandwidth': 'Pralaidumas',
  'settings.batterySaver': 'Baterijos taupymas',
  'settings.batterySaverDesc': 'Sustabdyti P2P, kai programa yra fone',
  'settings.builtWith': 'Sukurta su: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Kameros testas nepavyko',
  'settings.cameraUpdated': 'Kamera atnaujinta',
  'settings.cameras': 'Kameros',
  'settings.chatDensity_comfortable': 'Patogu',
  'settings.chatDensity_compact': 'Kompaktiška',
  'settings.chatDensity_cozy': 'Patogu',
  'settings.chatSubtitle': 'Konfigūruokite savo pokalbių patirtį',
  'settings.clearCache': 'Išvalyti talpyklą',
  'settings.clickToCopy': 'Spustelėkite, kad nukopijuotumėte',
  'settings.collapseMessages': 'Sutraukti žinutes',
  'settings.collapseMessagesDesc': 'Grupuoti nuoseklias žinutes iš to paties siuntėjo',
  'settings.compressImages': 'Suspausti vaizdus',
  'settings.compressImagesDesc': 'Suspausti vaizdus prieš siunčiant',
  'settings.compressVideos': 'Suspausti vaizdo įrašus',
  'settings.compressVideosDesc': 'Suspausti vaizdo įrašus prieš siunčiant, kad būtų sumažintas duomenų naudojimas',
  'settings.connected': 'Prisijungta',
  'settings.connecting': 'Jungiamasi',
  'settings.connectionStatus': 'Ryšio būsena',
  'settings.copied': 'Nukopijuota!',
  'settings.copyToClipboard': 'Kopijuoti į iškarpinę',
  'settings.defaultAudioQuality': 'Numatytoji garso kokybė',
  'settings.defaultSpeaker': 'Numatytasis garsiakalbis',
  'settings.defaultVideoQuality': 'Numatytoji vaizdo kokybė',
  'settings.detectedHardware': 'Aptikta aparatinė įranga',
  'settings.devicesAreAutoDetected': 'Įrenginiai aptinkami automatiškai. Pakeitimai pritaikomi realiu laiku.',
  'settings.disconnected': 'Atsijungta',
  'settings.doNotDisturb': 'Netrukdyti',
  'settings.doNotDisturbDesc': 'Slopinoti visus pranešimus',
  'settings.doYouLikeAsgard': 'Ar jums patinka Asgard programa?',
  'settings.donationIn': 'Paaukoti',
  'settings.enableNotifications': 'Įjungti pranešimus',
  'settings.enableNotificationsDesc': 'Rodyti Windows pranešimus apie naujas žinutes',
  'settings.enableRelay': 'Įjungti perdavimą',
  'settings.enableRelayDesc': 'Naudoti akluosius perdavėjus, kai tiesioginiai ryšiai nepasiekiami',
  'settings.exportData': 'Eksportuoti duomenis',
  'settings.flushDht': 'Ištuštinti DHT',
  'settings.grantPermission': 'Suteikti leidimą',
  'settings.grantPermissionDesc': 'Suteikite leidimą peržiūrėti įrenginių pavadinimus ir konfigūruoti aparatinę įrangą.',
  'settings.hideRecoveryPhrase': 'Slėpti atkūrimo frazę',
  'settings.highContrast': 'Didelis kontrastas',
  'settings.highContrastDesc': 'Padidinti kontrastą geresniam matomumui',
  'settings.importData': 'Importuoti duomenis',
  'settings.inlinePreviews': 'Integruotos peržiūros',
  'settings.inlinePreviewsDesc': 'Rodyti vaizdų peržiūras tiesiai pokalbyje',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Klaviatūros naršymas',
  'settings.keyboardNavigationDesc': 'Rodyti sparčiuosius klavišus ir fokuso indikatorius',
  'settings.largerTouchTargets': 'Didesni lietimo taikiniai',
  'settings.largerTouchTargetsDesc': 'Padaryti mygtukus ir interaktyvius elementus lengviau paliečiamus',
  'settings.linkPreviews': 'Nuorodų peržiūros',
  'settings.linkPreviewsDesc': 'Automatiškai gauti ir rodyti nuorodų peržiūras (gali atskleisti jūsų naršymo veiklą)',
  'settings.localCache': 'Vietinė talpykla',
  'settings.manageTrash': 'Tvarkyti šiukšlinę',
  'settings.maxPeers': 'Maksimalus peerų skaičius',
  'settings.mbLimit': 'MB riba',
  'settings.mediaSubtitle': 'Konfigūruokite medijos atkūrimą ir suspaudimą',
  'settings.mentionsOnly': 'Tik paminėjimai',
  'settings.mentionsOnlyDesc': 'Pranešti tik apie paminėjimus ir tiesioginius pranešimus',
  'settings.messageDensity': 'Žinučių tankis',
  'settings.messagePreview': 'Žinutės peržiūra',
  'settings.messagePreviewDesc': 'Rodyti žinutės turinį pranešimuose',
  'settings.microphone': 'Mikrofonas',
  'settings.microphoneAccess': 'Mikrofono ir kameros prieiga',
  'settings.microphoneUpdated': 'Mikrofonas atnaujintas',
  'settings.microphones': 'Mikrofonai',
  'settings.muteByDefault': 'Nutildyta pagal numatytuosius',
  'settings.muteByDefaultDesc': 'Pradėti vaizdo įrašus tylos režimu',
  'settings.networkSubtitle': 'P2P ryšio nustatymai',
  'settings.neverShareRecoveryPhrase': 'Niekada nesidalykite savo atkūrimo fraze!',
  'settings.new': 'Naujas',
  'settings.notAvailable': 'Nepasiekiama',
  'settings.notificationSoundDesc': 'Groti garsą naujoms žinutėms',
  'settings.onlineStatus': 'Prisijungimo būsena',
  'settings.onlineStatusDesc': 'Leiskite savo kontaktams matyti jūsų prisijungimo būseną',
  'settings.peerLatency': 'Peerų delsos laikas',
  'settings.peerQuality': 'Peerų kokybė',
  'settings.peers': 'Peerai',
  'settings.readReceipts': 'Skaitymo patvirtinimai',
  'settings.readReceiptsDesc': 'Informuoti kitus, kai perskaitėte jų žinutes',
  'settings.recoveryPhrase': 'Atkūrimo frazė',
  'settings.recoveryPhraseDesc': 'Jūsų 24 žodžių atkūrimo frazė gali būti naudojama atkurti jūsų tapatybę kitame įrenginyje. Laikykite ją saugiai ir niekada ja nesidalykite.',
  'settings.recoveryPhraseWarning': 'Bet kas su šiais žodžiais gali pasiekti jūsų paskyrą.',
  'settings.reducedMotion': 'Sumažinti animacijas',
  'settings.reducedMotionDesc': 'Sumažinti animacijas ir perėjimus',
  'settings.screenReaderOptimizations': 'Ekrano skaitytuvo optimizavimas',
  'settings.screenReaderOptimizationsDesc': 'Patobulintas ekrano skaitytuvų palaikymas',
  'settings.securitySubtitle': 'Tvarkykite savo tapatybę ir atkūrimo frazę',
  'settings.sendOnEnter': 'Siųsti su Enter',
  'settings.sendOnEnterDesc': 'Paspauskite Enter, kad siųstumėte, Shift+Enter naujai eilutei',
  'settings.showReadStatus': 'Rodyti skaitymo būseną',
  'settings.showReadStatusDesc': 'Rodyti skaitymo patvirtinimus išsiųstose žinutėse',
  'settings.showRecoveryPhrase': 'Rodyti atkūrimo frazę',
  'settings.showSeconds': 'Rodyti sekundes',
  'settings.showSecondsDesc': 'Įtraukti sekundes į laiko žymas',
  'settings.showTimestamps': 'Rodyti laiko žymas',
  'settings.showTimestampsDesc': 'Rodyti laiką šalia kiekvienos žinutės',
  'settings.showVideoControls': 'Rodyti vaizdo valdiklius',
  'settings.showVideoControlsDesc': 'Rodyti atkūrimo valdiklius vaizdo įrašuose',
  'settings.speaker': 'Garsiakalbis',
  'settings.speakerUpdated': 'Garsiakalbis atnaujintas',
  'settings.speakers': 'Garsiakalbiai',
  'settings.stopTest': 'Sustabdyti testą',
  'settings.storageSubtitle': 'Tvarkykite vietinius duomenis ir atsisiuntimus',
  'settings.suspended': 'Sustabdyta',
  'settings.testCamera': 'Testuoti kamerą',
  'settings.testMic': 'Testuoti mikrofoną',
  'settings.textToSpeech': 'Tekstas į kalbą',
  'settings.textToSpeechDesc': 'Skaityti žinutes garsiai',
  'settings.topics': 'Temos',
  'settings.tradeCryptocurrencyPrivately': 'Prekiauti kriptovaliutomis privačiai',
  'settings.typingIndicators': 'Rašymo indikatoriai',
  'settings.typingIndicatorsDesc': 'Leisti kitiems matyti, kai rašote',
  'settings.usedOf': 'naudota iš',
  'settings.videoQuality_auto': 'Automatinis',
  'settings.videoQuality_high': 'Aukšta',
  'settings.videoQuality_low': 'Žema',
  'settings.videoQuality_medium': 'Vidutinė',
  'settings.yourIdentity': 'Jūsų tapatybė',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'lt') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (ltTranslations[key]) {
    const newValue = ltTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Lithuanian translations.`)
