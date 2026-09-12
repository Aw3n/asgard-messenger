import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const svTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Ladda upp foto',
  'avatar.cropAvatar': 'Beskär avatar',
  'avatar.cancel': 'Avbryt',
  'avatar.cropSave': 'Beskär och spara',

  // ─── calls ───
  'calls.openChat': 'Chatt',
  'calls.refreshServer': 'Uppdatera serveranslutning',
  'calls.noContactsFound': 'Inga kontakter hittades',
  'calls.startCallHint': 'Starta ett samtal från kontaktlistan',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Ladda om kontakter från Hyperbee-lagring',
  'contacts.displayNameOptional': 'Visningsnamn (valfritt)',
  'contacts.displayNamePlaceholder': 'Hur ska de visas?',
  'contacts.selectContact': 'Välj en kontakt för att se detaljer',
  'contacts.noBlockedContacts': 'Inga blockerade kontakter',
  'contacts.noContactsFound': 'Inga kontakter hittades',
  'contacts.error.publicKeyRequired': 'Ange en offentlig nyckel',
  'contacts.error.invalidPublicKey': 'Ogiltigt format för offentlig nyckel',
  'contacts.error.noIdentity': 'Ingen identitet tillgänglig',
  'contacts.error.noContactsFound': 'Inga kontakter hittades i Hyperbee-lagring',
  'contacts.error.failedToReload': 'Kunde inte ladda om kontakter',

  // ─── groups ───
  'groups.admins': 'Administratörer',
  'groups.groups': 'Grupper',
  'groups.create': 'Skapa',
  'groups.searchGroups': 'Sök grupper…',
  'groups.noGroupsFound': 'Inga grupper hittades',
  'groups.noGroupsYet': 'Inga grupper ännu',
  'groups.createGroupHint': 'Skapa en grupp för att börja samarbeta',
  'groups.createFirstGroup': 'Skapa din första grupp',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Avbryt svar',
  'messageInput.attachFile': 'Bifoga fil',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Skicka meddelande',
  'messageInput.dropFiles': 'Släpp filer här',
  'messageInput.replyingTo': 'Svarar till',
  'messageInput.messageDeleted': 'Meddelande borttaget',

  // ─── modal ───
  'modal.addContact': 'Lägg till kontakt',
  'modal.publicKey': 'Offentlig nyckel',
  'modal.publicKeyPlaceholder': 'Ange kontaktens offentliga nyckel…',
  'modal.displayName': 'Visningsnamn (valfritt)',
  'modal.displayNamePlaceholder': 'Ge denna kontakt ett namn…',
  'modal.cancel': 'Avbryt',
  'modal.add': 'Lägg till',
  'modal.shareKey': 'Dela din offentliga nyckel med din kontakt så att de kan lägga till dig. Du hittar den i Inställningar → Profil.',
  'modal.error.publicKeyRequired': 'Offentlig nyckel krävs',
  'modal.error.publicKeyTooShort': 'Offentlig nyckel är för kort',
  'modal.error.contactExists': 'Kontakten finns redan',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimera',
  'titlebar.maximize': 'Maximera',
  'titlebar.close': 'Stäng',

  // ─── toast ───
  'toast.dismiss': 'Stäng',
  'toast.dataImported': 'Data importerad',
  'toast.importFailed': 'Import misslyckades',
  'toast.invalidBackupFile': 'Ogiltig säkerhetskopieringsfil',
  'toast.cacheCleared': 'Cache rensad',
  'toast.failedToClearCache': 'Kunde inte rensa cache',
  'toast.permissionGranted': 'Behörighet beviljad',
  'toast.permissionDenied': 'Behörighet nekad',
  'toast.microphoneUpdated': 'Mikrofon uppdaterad',
  'toast.cameraUpdated': 'Kamera uppdaterad',
  'toast.speakerUpdated': 'Högtalare uppdaterad',
  'toast.cameraTestFailed': 'Kameratest misslyckades',
  'toast.addressCopied': 'Adress kopierad till urklipp',
  'toast.failedToCopyAddress': 'Kunde inte kopiera adress',
  'toast.contactAdded': 'Kontakt tillagd — upptäckt startad',
  'toast.failedToAddContact': 'Kunde inte lägga till kontakt',

  // ─── settings ───
  'settings.audio': 'Ljud',
  'settings.fileType_audio': 'Ljud',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Version {{version}}',
  'settings.accessibilitySubtitle': 'Gör Asgard mer tillgänglig för dig',
  'settings.atTheFollowingAddress': 'på följande adress:',
  'settings.audioQuality_high': 'Hög',
  'settings.audioQuality_low': 'Låg',
  'settings.audioQuality_medium': 'Medel',
  'settings.autoDownload': 'Automatisk nedladdning',
  'settings.autoDownloadAudioDesc': 'Ladda ner ljudmeddelanden automatiskt',
  'settings.autoDownloadImagesDesc': 'Ladda ner bilder automatiskt',
  'settings.autoDownloadVideosDesc': 'Ladda ner videor automatiskt',
  'settings.autoEmoji': 'Automatisk emoji',
  'settings.autoEmojiDesc': 'Konvertera textgenvägar som :) till emoji',
  'settings.autoPlayGifs': 'Spela GIFs automatiskt',
  'settings.autoPlayGifsDesc': 'Animera GIF-bilder automatiskt',
  'settings.autoPlayVideos': 'Spela videor automatiskt',
  'settings.autoPlayVideosDesc': 'Spela videor automatiskt när de är synliga',
  'settings.bandwidth': 'Bandbredd',
  'settings.batterySaver': 'Batterisparare',
  'settings.batterySaverDesc': 'Pausa P2P när appen är i bakgrunden',
  'settings.builtWith': 'Byggd med: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Kameratest misslyckades',
  'settings.cameraUpdated': 'Kamera uppdaterad',
  'settings.cameras': 'Kameror',
  'settings.chatDensity_comfortable': 'Bekväm',
  'settings.chatDensity_compact': 'Kompakt',
  'settings.chatDensity_cozy': 'Bekväm',
  'settings.chatSubtitle': 'Konfigurera din chattupplevelse',
  'settings.clearCache': 'Rensa cache',
  'settings.clickToCopy': 'Klicka för att kopiera',
  'settings.collapseMessages': 'Komprimera meddelanden',
  'settings.collapseMessagesDesc': 'Gruppera på varandra följande meddelanden från samma avsändare',
  'settings.compressImages': 'Komprimera bilder',
  'settings.compressImagesDesc': 'Komprimera bilder innan de skickas',
  'settings.compressVideos': 'Komprimera videor',
  'settings.compressVideosDesc': 'Komprimera videor innan de skickas för att minska dataanvändning',
  'settings.connected': 'Ansluten',
  'settings.connecting': 'Ansluter',
  'settings.connectionStatus': 'Anslutningsstatus',
  'settings.copied': 'Kopierat!',
  'settings.copyToClipboard': 'Kopiera till urklipp',
  'settings.defaultAudioQuality': 'Standard ljudkvalitet',
  'settings.defaultSpeaker': 'Standardhögtalare',
  'settings.defaultVideoQuality': 'Standard videokvalitet',
  'settings.detectedHardware': 'Identifierad hårdvara',
  'settings.devicesAreAutoDetected': 'Enheter identifieras automatiskt. Ändringar tillämpas i realtid.',
  'settings.disconnected': 'Frånkopplad',
  'settings.doNotDisturb': 'Stör ej',
  'settings.doNotDisturbDesc': 'Undertryck alla aviseringar',
  'settings.doYouLikeAsgard': 'Gillar du Asgard-appen?',
  'settings.donationIn': 'Donera i',
  'settings.enableNotifications': 'Aktivera aviseringar',
  'settings.enableNotificationsDesc': 'Visa Windows-aviseringar för nya meddelanden',
  'settings.enableRelay': 'Aktivera relä',
  'settings.enableRelayDesc': 'Använd blinda relän när direkta anslutningar inte är tillgängliga',
  'settings.exportData': 'Exportera data',
  'settings.flushDht': 'Töm DHT',
  'settings.grantPermission': 'Bevilja behörighet',
  'settings.grantPermissionDesc': 'Bevilja behörighet för att se enhetsnamn och konfigurera din hårdvara.',
  'settings.hideRecoveryPhrase': 'Dölj återställningsfras',
  'settings.highContrast': 'Hög kontrast',
  'settings.highContrastDesc': 'Öka kontrasten för bättre synlighet',
  'settings.importData': 'Importera data',
  'settings.inlinePreviews': 'Integrerade förhandsvisningar',
  'settings.inlinePreviewsDesc': 'Visa bildförhandsvisningar direkt i chatten',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Tangentbordsnavigering',
  'settings.keyboardNavigationDesc': 'Visa tangentbordsgenvägar och fokusindikatorer',
  'settings.largerTouchTargets': 'Större tryckmål',
  'settings.largerTouchTargetsDesc': 'Gör knappar och interaktiva element lättare att trycka',
  'settings.linkPreviews': 'Länkförhandsvisningar',
  'settings.linkPreviewsDesc': 'Hämta och visa länkförhandsvisningar automatiskt (kan avslöja din surfaktivitet)',
  'settings.localCache': 'Lokal cache',
  'settings.manageTrash': 'Hantera papperskorg',
  'settings.maxPeers': 'Maximalt antal peers',
  'settings.mbLimit': 'MB-gräns',
  'settings.mediaSubtitle': 'Konfigurera medieuppspelning och komprimering',
  'settings.mentionsOnly': 'Endast omnämnanden',
  'settings.mentionsOnlyDesc': 'Avisera endast för omnämnanden och direkta meddelanden',
  'settings.messageDensity': 'Meddelandetäthet',
  'settings.messagePreview': 'Meddelandeförhandsvisning',
  'settings.messagePreviewDesc': 'Visa meddelandeinnehåll i aviseringar',
  'settings.microphone': 'Mikrofon',
  'settings.microphoneAccess': 'Mikrofon- och kameraåtkomst',
  'settings.microphoneUpdated': 'Mikrofon uppdaterad',
  'settings.microphones': 'Mikrofoner',
  'settings.muteByDefault': 'Ljudlös som standard',
  'settings.muteByDefaultDesc': 'Starta videor i ljudlöst läge',
  'settings.networkSubtitle': 'P2P-anslutningsinställningar',
  'settings.neverShareRecoveryPhrase': 'Dela aldrig din återställningsfras!',
  'settings.new': 'Ny',
  'settings.notAvailable': 'Inte tillgänglig',
  'settings.notificationSoundDesc': 'Spela ett ljud för nya meddelanden',
  'settings.onlineStatus': 'Onlinestatus',
  'settings.onlineStatusDesc': 'Låt dina kontakter se din onlinestatus',
  'settings.peerLatency': 'Peer-latens',
  'settings.peerQuality': 'Peer-kvalitet',
  'settings.peers': 'Peers',
  'settings.readReceipts': 'Läskvittenser',
  'settings.readReceiptsDesc': 'Meddela andra när du har läst deras meddelanden',
  'settings.recoveryPhrase': 'Återställningsfras',
  'settings.recoveryPhraseDesc': 'Din återställningsfras på 24 ord kan användas för att återställa din identitet på en annan enhet. Förvara den säkert och dela den aldrig.',
  'settings.recoveryPhraseWarning': 'Alla med dessa ord kan få tillgång till ditt konto.',
  'settings.reducedMotion': 'Minska rörelse',
  'settings.reducedMotionDesc': 'Minimera animationer och övergångar',
  'settings.screenReaderOptimizations': 'Skärmläsaroptimeringar',
  'settings.screenReaderOptimizationsDesc': 'Förbättrat stöd för skärmläsare',
  'settings.securitySubtitle': 'Hantera din identitet och återställningsfras',
  'settings.sendOnEnter': 'Skicka med Enter',
  'settings.sendOnEnterDesc': 'Tryck Enter för att skicka, Shift+Enter för ny rad',
  'settings.showReadStatus': 'Visa lässtatus',
  'settings.showReadStatusDesc': 'Visa läskvittenser på skickade meddelanden',
  'settings.showRecoveryPhrase': 'Visa återställningsfras',
  'settings.showSeconds': 'Visa sekunder',
  'settings.showSecondsDesc': 'Inkludera sekunder i tidsstämplar',
  'settings.showTimestamps': 'Visa tidsstämplar',
  'settings.showTimestampsDesc': 'Visa tid bredvid varje meddelande',
  'settings.showVideoControls': 'Visa videokontroller',
  'settings.showVideoControlsDesc': 'Visa uppspelningskontroller på videor',
  'settings.speaker': 'Högtalare',
  'settings.speakerUpdated': 'Högtalare uppdaterad',
  'settings.speakers': 'Högtalare',
  'settings.stopTest': 'Stoppa test',
  'settings.storageSubtitle': 'Hantera lokal data och nedladdningar',
  'settings.suspended': 'Pausad',
  'settings.testCamera': 'Testa kamera',
  'settings.testMic': 'Testa mikrofon',
  'settings.textToSpeech': 'Text till tal',
  'settings.textToSpeechDesc': 'Läs meddelanden högt',
  'settings.topics': 'Ämnen',
  'settings.tradeCryptocurrencyPrivately': 'Handla kryptovaluta privat',
  'settings.typingIndicators': 'Skrivindikatorer',
  'settings.typingIndicatorsDesc': 'Låt andra se när du skriver',
  'settings.usedOf': 'använt av',
  'settings.videoQuality_auto': 'Automatisk',
  'settings.videoQuality_high': 'Hög',
  'settings.videoQuality_low': 'Låg',
  'settings.videoQuality_medium': 'Medel',
  'settings.yourIdentity': 'Din identitet',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'sv') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (svTranslations[key]) {
    const newValue = svTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Swedish translations.`)
