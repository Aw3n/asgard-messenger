import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

// ── Complete Dutch translations for all 180 keys still in FR/EN ──
const nlTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Foto uploaden',
  'avatar.cropAvatar': 'Avatar bijsnijden',
  'avatar.cancel': 'Annuleren',
  'avatar.cropSave': 'Bijsnijden en opslaan',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Serververbinding vernieuwen',
  'calls.noContactsFound': 'Geen contacten gevonden',
  'calls.startCallHint': 'Start een gesprek vanuit de contactenlijst',

  // ─── contacts ───
  'contacts.reloadContacts': 'Contacten opnieuw laden uit Hyperbee-opslag',
  'contacts.displayNameOptional': 'Weergavenaam (optioneel)',
  'contacts.displayNamePlaceholder': 'Hoe moeten ze verschijnen?',
  'contacts.selectContact': 'Selecteer een contact om details te bekijken',
  'contacts.noBlockedContacts': 'Geen geblokkeerde contacten',
  'contacts.noContactsFound': 'Geen contacten gevonden',

  // ─── groups ───
  'groups.groups': 'Groepen',
  'groups.create': 'Aanmaken',
  'groups.searchGroups': 'Groepen zoeken…',
  'groups.noGroupsFound': 'Geen groepen gevonden',
  'groups.noGroupsYet': 'Nog geen groepen',
  'groups.createGroupHint': 'Maak een groep aan om samen te werken',
  'groups.createFirstGroup': 'Maak uw eerste groep aan',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Antwoord annuleren',
  'messageInput.attachFile': 'Bestand bijvoegen',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Bericht verzenden',
  'messageInput.dropFiles': 'Bestanden hier neerzetten',
  'messageInput.replyingTo': 'Antwoord aan',
  'messageInput.messageDeleted': 'Bericht verwijderd',

  // ─── modal ───
  'modal.addContact': 'Contact toevoegen',
  'modal.publicKey': 'Publieke sleutel',
  'modal.publicKeyPlaceholder': 'Voer de publieke sleutel van het contact in…',
  'modal.displayName': 'Weergavenaam (optioneel)',
  'modal.displayNamePlaceholder': 'Geef dit contact een naam…',
  'modal.cancel': 'Annuleren',
  'modal.add': 'Toevoegen',
  'modal.shareKey': 'Deel uw publieke sleutel met uw contact zodat ze u ook kunnen toevoegen. U vindt deze in Instellingen → Profiel.',
  'modal.error.publicKeyRequired': 'Publieke sleutel is vereist',
  'modal.error.publicKeyTooShort': 'Publieke sleutel is te kort',
  'modal.error.contactExists': 'Contact bestaat al',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimaliseren',
  'titlebar.maximize': 'Maximaliseren',
  'titlebar.close': 'Sluiten',

  // ─── toast ───
  'toast.dismiss': 'Sluiten',
  'toast.dataImported': 'Gegevens succesvol geïmporteerd',
  'toast.importFailed': 'Importeren mislukt',
  'toast.invalidBackupFile': 'Ongeldig back-upbestand',
  'toast.cacheCleared': 'Cache gewist',
  'toast.failedToClearCache': 'Cache wissen mislukt',
  'toast.permissionGranted': 'Toestemming verleend',
  'toast.permissionDenied': 'Toestemming geweigerd',
  'toast.microphoneUpdated': 'Microfoon bijgewerkt',
  'toast.cameraUpdated': 'Camera bijgewerkt',
  'toast.speakerUpdated': 'Luidspreker bijgewerkt',
  'toast.cameraTestFailed': 'Cameratest mislukt',
  'toast.addressCopied': 'Adres gekopieerd naar klembord',
  'toast.failedToCopyAddress': 'Adres kopiëren mislukt',
  'toast.contactAdded': 'Contact toegevoegd — ontdekking gestart',
  'toast.failedToAddContact': 'Contact toevoegen mislukt',

  // ─── settings (140 keys) ───
  'settings.audio': 'Audio',
  'settings.fileType_audio': 'Audio',
  'settings.accessibilitySubtitle': 'Maak Asgard toegankelijker voor u',
  'settings.atTheFollowingAddress': 'op het volgende adres:',
  'settings.audioQuality_high': 'Hoog',
  'settings.audioQuality_low': 'Laag',
  'settings.audioQuality_medium': 'Gemiddeld',
  'settings.autoDownload': 'Automatisch downloaden',
  'settings.autoDownloadAudioDesc': 'Audioberichten automatisch downloaden',
  'settings.autoDownloadImagesDesc': 'Afbeeldingen automatisch downloaden',
  'settings.autoDownloadVideosDesc': 'Video\'s automatisch downloaden',
  'settings.autoEmoji': 'Automatische emoji',
  'settings.autoEmojiDesc': 'Tekstsnelkoppelingen zoals :) omzetten naar emoji',
  'settings.autoPlayGifs': 'GIF\'s automatisch afspelen',
  'settings.autoPlayGifsDesc': 'GIF-afbeeldingen automatisch animeren',
  'settings.autoPlayVideos': 'Video\'s automatisch afspelen',
  'settings.autoPlayVideosDesc': 'Video\'s automatisch afspelen wanneer zichtbaar',
  'settings.bandwidth': 'Bandbreedte',
  'settings.batterySaver': 'Batterijbesparing',
  'settings.batterySaverDesc': 'P2P onderbreken wanneer de app op de achtergrond staat',
  'settings.builtWith': 'Gebouwd met: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Camera',
  'settings.cameraTestFailed': 'Cameratest mislukt',
  'settings.cameraUpdated': 'Camera bijgewerkt',
  'settings.cameras': 'Camera\'s',
  'settings.chatDensity_comfortable': 'Comfortabel',
  'settings.chatDensity_compact': 'Compact',
  'settings.chatDensity_cozy': 'Comfortabel',
  'settings.chatSubtitle': 'Configureer uw chatervaring',
  'settings.clearCache': 'Cache wissen',
  'settings.clickToCopy': 'Klik om te kopiëren',
  'settings.collapseMessages': 'Berichten samenvouwen',
  'settings.collapseMessagesDesc': 'Opeenvolgende berichten van dezelfde afzender groeperen',
  'settings.compressImages': 'Afbeeldingen comprimeren',
  'settings.compressImagesDesc': 'Afbeeldingen comprimeren voor het verzenden',
  'settings.compressVideos': 'Video\'s comprimeren',
  'settings.compressVideosDesc': 'Video\'s comprimeren voor het verzenden om datagebruik te verminderen',
  'settings.connected': 'Verbonden',
  'settings.connecting': 'Verbinden',
  'settings.connectionStatus': 'Verbindingsstatus',
  'settings.copied': 'Gekopieerd!',
  'settings.copyToClipboard': 'Kopiëren naar klembord',
  'settings.defaultAudioQuality': 'Standaard audiokwaliteit',
  'settings.defaultSpeaker': 'Standaard luidspreker',
  'settings.defaultVideoQuality': 'Standaard videokwaliteit',
  'settings.detectedHardware': 'Gedetecteerde hardware',
  'settings.devicesAreAutoDetected': 'Apparaten worden automatisch gedetecteerd. Wijzigingen worden direct toegepast.',
  'settings.disconnected': 'Verbroken',
  'settings.doNotDisturb': 'Niet storen',
  'settings.doNotDisturbDesc': 'Alle meldingen onderdrukken',
  'settings.doYouLikeAsgard': 'Vindt u de Asgard-app leuk?',
  'settings.donationIn': 'Doneer in',
  'settings.enableNotifications': 'Meldingen inschakelen',
  'settings.enableNotificationsDesc': 'Windows-meldingen weergeven voor nieuwe berichten',
  'settings.enableRelay': 'Relay inschakelen',
  'settings.enableRelayDesc': 'Blind-relays gebruiken wanneer directe verbindingen niet beschikbaar zijn',
  'settings.exportData': 'Gegevens exporteren',
  'settings.flushDht': 'DHT legen',
  'settings.grantPermission': 'Toestemming verlenen',
  'settings.grantPermissionDesc': 'Verleen toestemming om apparaatnamen te zien en uw hardware in te stellen.',
  'settings.hideRecoveryPhrase': 'Herstelzin verbergen',
  'settings.highContrast': 'Hoog contrast',
  'settings.highContrastDesc': 'Contrast verhogen voor betere zichtbaarheid',
  'settings.importData': 'Gegevens importeren',
  'settings.inlinePreviews': 'Inline voorbeelden',
  'settings.inlinePreviewsDesc': 'Afbeeldingvoorbeelden direct in de chat weergeven',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Toetsenbordnavigatie',
  'settings.keyboardNavigationDesc': 'Toetsenbordsnelkoppelingen en focusindicatoren weergeven',
  'settings.largerTouchTargets': 'Grotere aanraakdoelen',
  'settings.largerTouchTargetsDesc': 'Knoppen en interactieve elementen groter maken voor makkelijker aanraken',
  'settings.linkPreviews': 'Linkvoorbeelden',
  'settings.linkPreviewsDesc': 'Automatisch linkvoorbeelden ophalen en weergeven (kan uw browseactiviteit onthullen)',
  'settings.localCache': 'Lokale cache',
  'settings.manageTrash': 'Prullenbak beheren',
  'settings.maxPeers': 'Maximaal aantal peers',
  'settings.mbLimit': 'MB limiet',
  'settings.mediaSubtitle': 'Configureer het afspelen en comprimeren van media',
  'settings.mentionsOnly': 'Alleen vermeldingen',
  'settings.mentionsOnlyDesc': 'Alleen melden voor vermeldingen en directe berichten',
  'settings.messageDensity': 'Berichtdichtheid',
  'settings.messagePreview': 'Berichtvoorbeeld',
  'settings.messagePreviewDesc': 'Berichtinhoud in meldingen weergeven',
  'settings.microphone': 'Microfoon',
  'settings.microphoneAccess': 'Microfoon- en cameratoegang',
  'settings.microphoneUpdated': 'Microfoon bijgewerkt',
  'settings.microphones': 'Microfoons',
  'settings.muteByDefault': 'Standaard gedempt',
  'settings.muteByDefaultDesc': 'Video\'s starten in gedempte modus',
  'settings.networkSubtitle': 'P2P-verbindingsinstellingen',
  'settings.neverShareRecoveryPhrase': 'Deel nooit uw herstelzin!',
  'settings.new': 'Nieuw',
  'settings.notAvailable': 'Niet beschikbaar',
  'settings.notificationSoundDesc': 'Geluid afspelen voor nieuwe berichten',
  'settings.onlineStatus': 'Onlinestatus',
  'settings.onlineStatusDesc': 'Laat uw contacten uw onlinestatus zien',
  'settings.peerLatency': 'Peer-latency',
  'settings.peerQuality': 'Peer-kwaliteit',
  'settings.peers': 'Peers',
  'settings.readReceipts': 'Leesbevestigingen',
  'settings.readReceiptsDesc': 'Laat anderen weten wanneer u hun berichten heeft gelezen',
  'settings.recoveryPhrase': 'Herstelzin',
  'settings.recoveryPhraseDesc': 'Uw herstelzin van 24 woorden kan worden gebruikt om uw identiteit op een ander apparaat te herstellen. Bewaar deze veilig en deel deze nooit met iemand.',
  'settings.recoveryPhraseWarning': 'Iedereen met deze woorden kan toegang krijgen tot uw account.',
  'settings.reducedMotion': 'Animaties verminderen',
  'settings.reducedMotionDesc': 'Animaties en overgangen minimaliseren',
  'settings.screenReaderOptimizations': 'Schermlezer-optimalisaties',
  'settings.screenReaderOptimizationsDesc': 'Verbeterde ondersteuning voor schermlezers',
  'settings.securitySubtitle': 'Beheer uw identiteit en herstelzin',
  'settings.sendOnEnter': 'Verzenden met Enter',
  'settings.sendOnEnterDesc': 'Druk op Enter om te verzenden, Shift+Enter voor nieuwe regel',
  'settings.showReadStatus': 'Leesstatus weergeven',
  'settings.showReadStatusDesc': 'Leesbevestigingen tonen op verzonden berichten',
  'settings.showRecoveryPhrase': 'Herstelzin weergeven',
  'settings.showSeconds': 'Seconden weergeven',
  'settings.showSecondsDesc': 'Seconden toevoegen aan tijdstempels',
  'settings.showTimestamps': 'Tijdstempels weergeven',
  'settings.showTimestampsDesc': 'Tijd weergeven naast elk bericht',
  'settings.showVideoControls': 'Videobediening weergeven',
  'settings.showVideoControlsDesc': 'Afspeelknoppen op video\'s weergeven',
  'settings.speaker': 'Luidspreker',
  'settings.speakerUpdated': 'Luidspreker bijgewerkt',
  'settings.speakers': 'Luidsprekers',
  'settings.stopTest': 'Test stoppen',
  'settings.storageSubtitle': 'Beheer lokale gegevens en downloads',
  'settings.suspended': 'Onderbroken',
  'settings.testCamera': 'Camera testen',
  'settings.testMic': 'Microfoon testen',
  'settings.textToSpeech': 'Tekst-naar-spraak',
  'settings.textToSpeechDesc': 'Berichten hardop voorlezen',
  'settings.topics': 'Onderwerpen',
  'settings.tradeCryptocurrencyPrivately': 'Privé handelen in cryptocurrency',
  'settings.typingIndicators': 'Typindicatoren',
  'settings.typingIndicatorsDesc': 'Anderen toestaan te zien wanneer u typt',
  'settings.usedOf': 'gebruikt van',
  'settings.videoQuality_auto': 'Automatisch',
  'settings.videoQuality_high': 'Hoog',
  'settings.videoQuality_low': 'Laag',
  'settings.videoQuality_medium': 'Gemiddeld',
  'settings.yourIdentity': 'Uw identiteit',

  // ─── contacts errors ───
  'contacts.error.publicKeyRequired': 'Voer een publieke sleutel in',
  'contacts.error.invalidPublicKey': 'Ongeldig formaat publieke sleutel',
  'contacts.error.noIdentity': 'Geen identiteit beschikbaar',
  'contacts.error.noContactsFound': 'Geen contacten gevonden in Hyperbee-opslag',
  'contacts.error.failedToReload': 'Herladen van contacten mislukt',
}

// ── Apply translations ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) {
    currentLang = m[1]
    continue
  }
  
  if (currentLang !== 'nl') continue
  
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  
  const [, indent, key, oldValue, comma] = keyMatch
  if (nlTranslations[key]) {
    const newValue = nlTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Dutch translations.`)
