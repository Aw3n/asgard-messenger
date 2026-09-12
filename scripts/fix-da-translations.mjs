import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const daTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Upload foto',
  'avatar.cropAvatar': 'Beskær avatar',
  'avatar.cancel': 'Annuller',
  'avatar.cropSave': 'Beskær og gem',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Opdater serverforbindelse',
  'calls.noContactsFound': 'Ingen kontakter fundet',
  'calls.startCallHint': 'Start et opkald fra kontaktlisten',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Genindlæs kontakter fra Hyperbee-lager',
  'contacts.displayNameOptional': 'Vist navn (valgfrit)',
  'contacts.displayNamePlaceholder': 'Hvordan skal de vises?',
  'contacts.selectContact': 'Vælg en kontakt for at se detaljer',
  'contacts.noBlockedContacts': 'Ingen blokerede kontakter',
  'contacts.noContactsFound': 'Ingen kontakter fundet',
  'contacts.error.publicKeyRequired': 'Indtast en offentlig nøgle',
  'contacts.error.invalidPublicKey': 'Ugyldigt format for offentlig nøgle',
  'contacts.error.noIdentity': 'Ingen identitet tilgængelig',
  'contacts.error.noContactsFound': 'Ingen kontakter fundet i Hyperbee-lager',
  'contacts.error.failedToReload': 'Kunne ikke genindlæse kontakter',

  // ─── groups ───
  'groups.admins': 'Administratorer',
  'groups.groups': 'Grupper',
  'groups.create': 'Opret',
  'groups.searchGroups': 'Søg grupper…',
  'groups.noGroupsFound': 'Ingen grupper fundet',
  'groups.noGroupsYet': 'Ingen grupper endnu',
  'groups.createGroupHint': 'Opret en gruppe for at begynde at samarbejde',
  'groups.createFirstGroup': 'Opret din første gruppe',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Annuller svar',
  'messageInput.attachFile': 'Vedhæft fil',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Send besked',
  'messageInput.dropFiles': 'Slip filer her',
  'messageInput.replyingTo': 'Svarer til',
  'messageInput.messageDeleted': 'Besked slettet',

  // ─── modal ───
  'modal.addContact': 'Tilføj kontakt',
  'modal.publicKey': 'Offentlig nøgle',
  'modal.publicKeyPlaceholder': 'Indtast kontaktens offentlige nøgle…',
  'modal.displayName': 'Vist navn (valgfrit)',
  'modal.displayNamePlaceholder': 'Giv denne kontakt et navn…',
  'modal.cancel': 'Annuller',
  'modal.add': 'Tilføj',
  'modal.shareKey': 'Del din offentlige nøgle med din kontakt, så de også kan tilføje dig. Du finder den i Indstillinger → Profil.',
  'modal.error.publicKeyRequired': 'Offentlig nøgle er påkrævet',
  'modal.error.publicKeyTooShort': 'Offentlig nøgle er for kort',
  'modal.error.contactExists': 'Kontakten findes allerede',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimer',
  'titlebar.maximize': 'Maksimer',
  'titlebar.close': 'Luk',

  // ─── toast ───
  'toast.dismiss': 'Luk',
  'toast.dataImported': 'Data importeret',
  'toast.importFailed': 'Import mislykkedes',
  'toast.invalidBackupFile': 'Ugyldig sikkerhedskopifil',
  'toast.cacheCleared': 'Cache ryddet',
  'toast.failedToClearCache': 'Kunne ikke rydde cache',
  'toast.permissionGranted': 'Tilladelse givet',
  'toast.permissionDenied': 'Tilladelse nægtet',
  'toast.microphoneUpdated': 'Mikrofon opdateret',
  'toast.cameraUpdated': 'Kamera opdateret',
  'toast.speakerUpdated': 'Højttaler opdateret',
  'toast.cameraTestFailed': 'Kameratest mislykkedes',
  'toast.addressCopied': 'Adresse kopieret til udklipsholder',
  'toast.failedToCopyAddress': 'Kunne ikke kopiere adresse',
  'toast.contactAdded': 'Kontakt tilføjet — opdagelse startet',
  'toast.failedToAddContact': 'Kunne ikke tilføje kontakt',

  // ─── settings ───
  'settings.audio': 'Lyd',
  'settings.fileType_audio': 'Lyd',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Version {{version}}',
  'settings.accessibilitySubtitle': 'Gør Asgard mere tilgængelig for dig',
  'settings.atTheFollowingAddress': 'på følgende adresse:',
  'settings.audioQuality_high': 'Høj',
  'settings.audioQuality_low': 'Lav',
  'settings.audioQuality_medium': 'Medium',
  'settings.autoDownload': 'Automatisk download',
  'settings.autoDownloadAudioDesc': 'Download lydbeskeder automatisk',
  'settings.autoDownloadImagesDesc': 'Download billeder automatisk',
  'settings.autoDownloadVideosDesc': 'Download videoer automatisk',
  'settings.autoEmoji': 'Automatisk emoji',
  'settings.autoEmojiDesc': 'Konverter tekstgenveje som :) til emoji',
  'settings.autoPlayGifs': 'Afspil GIFs automatisk',
  'settings.autoPlayGifsDesc': 'Animer GIF-billeder automatisk',
  'settings.autoPlayVideos': 'Afspil videoer automatisk',
  'settings.autoPlayVideosDesc': 'Afspil videoer automatisk, når de er synlige',
  'settings.bandwidth': 'Båndbredde',
  'settings.batterySaver': 'Batterisparefunktion',
  'settings.batterySaverDesc': 'Suspendér P2P, når appen er i baggrunden',
  'settings.builtWith': 'Bygget med: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Kameratest mislykkedes',
  'settings.cameraUpdated': 'Kamera opdateret',
  'settings.cameras': 'Kameraer',
  'settings.chatDensity_comfortable': 'Behagelig',
  'settings.chatDensity_compact': 'Kompakt',
  'settings.chatDensity_cozy': 'Behagelig',
  'settings.chatSubtitle': 'Konfigurer din chatoplevelse',
  'settings.clearCache': 'Ryd cache',
  'settings.clickToCopy': 'Klik for at kopiere',
  'settings.collapseMessages': 'Skjul beskeder',
  'settings.collapseMessagesDesc': 'Gruppér efterfølgende beskeder fra samme afsender',
  'settings.compressImages': 'Komprimer billeder',
  'settings.compressImagesDesc': 'Komprimer billeder før afsendelse',
  'settings.compressVideos': 'Komprimer videoer',
  'settings.compressVideosDesc': 'Komprimer videoer før afsendelse for at reducere dataforbrug',
  'settings.connected': 'Forbundet',
  'settings.connecting': 'Forbinder',
  'settings.connectionStatus': 'Forbindelsesstatus',
  'settings.copied': 'Kopieret!',
  'settings.copyToClipboard': 'Kopier til udklipsholder',
  'settings.defaultAudioQuality': 'Standard lydkvalitet',
  'settings.defaultSpeaker': 'Standardhøjttaler',
  'settings.defaultVideoQuality': 'Standard videokvalitet',
  'settings.detectedHardware': 'Registreret hardware',
  'settings.devicesAreAutoDetected': 'Enheder registreres automatisk. Ændringer anvendes i realtid.',
  'settings.disconnected': 'Afbrudt',
  'settings.doNotDisturb': 'Forstyr ikke',
  'settings.doNotDisturbDesc': 'Undertryk alle notifikationer',
  'settings.doYouLikeAsgard': 'Kan du lide Asgard-appen?',
  'settings.donationIn': 'Doner i',
  'settings.enableNotifications': 'Aktiver notifikationer',
  'settings.enableNotificationsDesc': 'Vis Windows-notifikationer for nye beskeder',
  'settings.enableRelay': 'Aktiver relay',
  'settings.enableRelayDesc': 'Brug blinde relay-servere, når direkte forbindelser ikke er tilgængelige',
  'settings.exportData': 'Eksporter data',
  'settings.flushDht': 'Tøm DHT',
  'settings.grantPermission': 'Giv tilladelse',
  'settings.grantPermissionDesc': 'Giv tilladelse til at se enhedsnavne og konfigurere din hardware.',
  'settings.hideRecoveryPhrase': 'Skjul gendannelsessætning',
  'settings.highContrast': 'Høj kontrast',
  'settings.highContrastDesc': 'Øg kontrasten for bedre synlighed',
  'settings.importData': 'Importer data',
  'settings.inlinePreviews': 'Integrerede forhåndsvisninger',
  'settings.inlinePreviewsDesc': 'Vis forhåndsvisninger af billeder direkte i chatten',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Tastaturnavigation',
  'settings.keyboardNavigationDesc': 'Vis tastaturgenveje og fokusindikatorer',
  'settings.largerTouchTargets': 'Større berøringsmål',
  'settings.largerTouchTargetsDesc': 'Gør knapper og interaktive elementer lettere at berøre',
  'settings.linkPreviews': 'Forhåndsvisninger af links',
  'settings.linkPreviewsDesc': 'Hent og vis forhåndsvisninger af links automatisk (kan afsløre din browsingaktivitet)',
  'settings.localCache': 'Lokal cache',
  'settings.manageTrash': 'Administrer papirkurv',
  'settings.maxPeers': 'Maksimalt antal peers',
  'settings.mbLimit': 'MB-grænse',
  'settings.mediaSubtitle': 'Konfigurer medieafspilning og komprimering',
  'settings.mentionsOnly': 'Kun omtaler',
  'settings.mentionsOnlyDesc': 'Giv kun notifikationer for omtaler og direkte beskeder',
  'settings.messageDensity': 'Beskeddensitet',
  'settings.messagePreview': 'Beskedforhåndsvisning',
  'settings.messagePreviewDesc': 'Vis beskedindhold i notifikationer',
  'settings.microphone': 'Mikrofon',
  'settings.microphoneAccess': 'Mikrofon- og kameraadgang',
  'settings.microphoneUpdated': 'Mikrofon opdateret',
  'settings.microphones': 'Mikrofoner',
  'settings.muteByDefault': 'Lydløs som standard',
  'settings.muteByDefaultDesc': 'Start videoer i lydløs tilstand',
  'settings.networkSubtitle': 'P2P-forbindelsesindstillinger',
  'settings.neverShareRecoveryPhrase': 'Del aldrig din gendannelsessætning!',
  'settings.new': 'Ny',
  'settings.notAvailable': 'Ikke tilgængelig',
  'settings.notificationSoundDesc': 'Afspil en lyd for nye beskeder',
  'settings.onlineStatus': 'Onlinestatus',
  'settings.onlineStatusDesc': 'Lad dine kontakter se din onlinestatus',
  'settings.peerLatency': 'Peer-forsinkelse',
  'settings.peerQuality': 'Peer-kvalitet',
  'settings.peers': 'Peers',
  'settings.readReceipts': 'Læsekvitteringer',
  'settings.readReceiptsDesc': 'Giv andre besked, når du har læst deres beskeder',
  'settings.recoveryPhrase': 'Gendannelsessætning',
  'settings.recoveryPhraseDesc': 'Din gendannelsessætning på 24 ord kan bruges til at gendanne din identitet på en anden enhed. Opbevar den sikkert og del den aldrig.',
  'settings.recoveryPhraseWarning': 'Alle med disse ord kan få adgang til din konto.',
  'settings.reducedMotion': 'Reducer bevægelse',
  'settings.reducedMotionDesc': 'Minimer animationer og overgange',
  'settings.screenReaderOptimizations': 'Skærmlæseroptimeringer',
  'settings.screenReaderOptimizationsDesc': 'Forbedret understøttelse af skærmlæsere',
  'settings.securitySubtitle': 'Administrer din identitet og gendannelsessætning',
  'settings.sendOnEnter': 'Send med Enter',
  'settings.sendOnEnterDesc': 'Tryk Enter for at sende, Shift+Enter for ny linje',
  'settings.showReadStatus': 'Vis læsestatus',
  'settings.showReadStatusDesc': 'Vis læsekvitteringer på sendte beskeder',
  'settings.showRecoveryPhrase': 'Vis gendannelsessætning',
  'settings.showSeconds': 'Vis sekunder',
  'settings.showSecondsDesc': 'Inkluder sekunder i tidsstempler',
  'settings.showTimestamps': 'Vis tidsstempler',
  'settings.showTimestampsDesc': 'Vis tid ved hver besked',
  'settings.showVideoControls': 'Vis videokontrol',
  'settings.showVideoControlsDesc': 'Vis afspilningsknapper på videoer',
  'settings.speaker': 'Højttaler',
  'settings.speakerUpdated': 'Højttaler opdateret',
  'settings.speakers': 'Højttalere',
  'settings.stopTest': 'Stop test',
  'settings.storageSubtitle': 'Administrer lokale data og downloads',
  'settings.suspended': 'Suspenderet',
  'settings.testCamera': 'Test kamera',
  'settings.testMic': 'Test mikrofon',
  'settings.textToSpeech': 'Tekst til tale',
  'settings.textToSpeechDesc': 'Læs beskeder højt',
  'settings.topics': 'Emner',
  'settings.tradeCryptocurrencyPrivately': 'Handl kryptovaluta privat',
  'settings.typingIndicators': 'Skriverindikatorer',
  'settings.typingIndicatorsDesc': 'Lad andre se, når du skriver',
  'settings.usedOf': 'brugt af',
  'settings.videoQuality_auto': 'Automatisk',
  'settings.videoQuality_high': 'Høj',
  'settings.videoQuality_low': 'Lav',
  'settings.videoQuality_medium': 'Medium',
  'settings.yourIdentity': 'Din identitet',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'da') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (daTranslations[key]) {
    const newValue = daTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Danish translations.`)
