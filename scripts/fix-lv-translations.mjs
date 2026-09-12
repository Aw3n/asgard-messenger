import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const lvTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Augšupielādēt foto',
  'avatar.cropAvatar': 'Apgriezt avataru',
  'avatar.cancel': 'Atcelt',
  'avatar.cropSave': 'Apgriezt un saglabāt',

  // ─── calls ───
  'calls.openChat': 'Tērzēšana',
  'calls.refreshServer': 'Atjaunot servera savienojumu',
  'calls.noContactsFound': 'Kontakti nav atrasti',
  'calls.startCallHint': 'Sāciet zvanu no kontaktu saraksta',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Pārlādēt kontaktus no Hyperbee krātuves',
  'contacts.displayNameOptional': 'Attēlojamais vārds (neobligāts)',
  'contacts.displayNamePlaceholder': 'Kā viņiem vajadzētu izskatīties?',
  'contacts.selectContact': 'Izvēlieties kontaktu, lai apskatītu detaļas',
  'contacts.noBlockedContacts': 'Nav bloķētu kontaktu',
  'contacts.noContactsFound': 'Kontakti nav atrasti',
  'contacts.error.publicKeyRequired': 'Ievadiet publisko atslēgu',
  'contacts.error.invalidPublicKey': 'Nederīgs publiskās atslēgas formāts',
  'contacts.error.noIdentity': 'Identitāte nav pieejama',
  'contacts.error.noContactsFound': 'Kontakti nav atrasti Hyperbee krātuvē',
  'contacts.error.failedToReload': 'Kontaktu pārlādēšana neizdevās',

  // ─── groups ───
  'groups.admins': 'Administratori',
  'groups.groups': 'Grupas',
  'groups.create': 'Izveidot',
  'groups.searchGroups': 'Meklēt grupas…',
  'groups.noGroupsFound': 'Grupas nav atrastas',
  'groups.noGroupsYet': 'Vēl nav grupu',
  'groups.createGroupHint': 'Izveidojiet grupu, lai sāktu sadarbību',
  'groups.createFirstGroup': 'Izveidojiet savu pirmo grupu',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Atcelt atbildi',
  'messageInput.attachFile': 'Pievienot failu',
  'messageInput.emoji': 'Emocijzīme',
  'messageInput.send': 'Sūtīt ziņojumu',
  'messageInput.dropFiles': 'Nometiet failus šeit',
  'messageInput.replyingTo': 'Atbildot uz',
  'messageInput.messageDeleted': 'Ziņojums dzēsts',

  // ─── modal ───
  'modal.addContact': 'Pievienot kontaktu',
  'modal.publicKey': 'Publiskā atslēga',
  'modal.publicKeyPlaceholder': 'Ievadiet kontakta publisko atslēgu…',
  'modal.displayName': 'Attēlojamais vārds (neobligāts)',
  'modal.displayNamePlaceholder': 'Piešķiriet šim kontaktam vārdu…',
  'modal.cancel': 'Atcelt',
  'modal.add': 'Pievienot',
  'modal.shareKey': 'Dalieties ar savu publisko atslēgu ar savu kontaktu, lai viņi arī varētu jūs pievienot. Atradīsiet to Iestatījumi → Profils.',
  'modal.error.publicKeyRequired': 'Publiskā atslēga ir obligāta',
  'modal.error.publicKeyTooShort': 'Publiskā atslēga ir pārāk īsa',
  'modal.error.contactExists': 'Kontakts jau pastāv',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimizēt',
  'titlebar.maximize': 'Maksimizēt',
  'titlebar.close': 'Aizvērt',

  // ─── toast ───
  'toast.dismiss': 'Aizvērt',
  'toast.dataImported': 'Dati veiksmīgi importēti',
  'toast.importFailed': 'Importēšana neizdevās',
  'toast.invalidBackupFile': 'Nederīgs dublējuma fails',
  'toast.cacheCleared': 'Kešatmiņa notīrīta',
  'toast.failedToClearCache': 'Kešatmiņas tīrīšana neizdevās',
  'toast.permissionGranted': 'Atļauja piešķirta',
  'toast.permissionDenied': 'Atļauja liegta',
  'toast.microphoneUpdated': 'Mikrofons atjaunināts',
  'toast.cameraUpdated': 'Kamera atjaunināta',
  'toast.speakerUpdated': 'Skaļrunis atjaunināts',
  'toast.cameraTestFailed': 'Kameras tests neizdevās',
  'toast.addressCopied': 'Adrese nokopēta starpliktuvē',
  'toast.failedToCopyAddress': 'Adreses kopēšana neizdevās',
  'toast.contactAdded': 'Kontakts pievienots — atklāšana sākta',
  'toast.failedToAddContact': 'Kontakta pievienošana neizdevās',

  // ─── settings ───
  'settings.audio': 'Audio',
  'settings.fileType_audio': 'Audio',
  'settings.profile': 'Profils',
  'settings.appVersion': 'Versija {{version}}',
  'settings.accessibilitySubtitle': 'Padariet Asgard sev pieejamāku',
  'settings.atTheFollowingAddress': 'šādā adresē:',
  'settings.audioQuality_high': 'Augsta',
  'settings.audioQuality_low': 'Zema',
  'settings.audioQuality_medium': 'Vidēja',
  'settings.autoDownload': 'Automātiska lejupielāde',
  'settings.autoDownloadAudioDesc': 'Automātiski lejupielādēt audio ziņojumus',
  'settings.autoDownloadImagesDesc': 'Automātiski lejupielādēt attēlus',
  'settings.autoDownloadVideosDesc': 'Automātiski lejupielādēt video',
  'settings.autoEmoji': 'Automātiskas emocijzīmes',
  'settings.autoEmojiDesc': 'Pārvērst teksta saīsnes kā :) par emocijzīmēm',
  'settings.autoPlayGifs': 'Automātiski atskaņot GIF',
  'settings.autoPlayGifsDesc': 'Automātiski animēt GIF attēlus',
  'settings.autoPlayVideos': 'Automātiski atskaņot video',
  'settings.autoPlayVideosDesc': 'Automātiski atskaņot video, kad tie ir redzami',
  'settings.bandwidth': 'Joslas platums',
  'settings.batterySaver': 'Akumulatora taupīšana',
  'settings.batterySaverDesc': 'Apturēt P2P, kad lietotne ir fonā',
  'settings.builtWith': 'Izveidots ar: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Kameras tests neizdevās',
  'settings.cameraUpdated': 'Kamera atjaunināta',
  'settings.cameras': 'Kameras',
  'settings.chatDensity_comfortable': 'Ērts',
  'settings.chatDensity_compact': 'Kompakts',
  'settings.chatDensity_cozy': 'Ērts',
  'settings.chatSubtitle': 'Konfigurējiet savu tērzēšanas pieredzi',
  'settings.clearCache': 'Notīrīt kešatmiņu',
  'settings.clickToCopy': 'Noklikšķiniet, lai kopētu',
  'settings.collapseMessages': 'Sakļaut ziņojumus',
  'settings.collapseMessagesDesc': 'Grupēt secīgus ziņojumus no viena sūtītāja',
  'settings.compressImages': 'Saspiest attēlus',
  'settings.compressImagesDesc': 'Saspiest attēlus pirms sūtīšanas',
  'settings.compressVideos': 'Saspiest video',
  'settings.compressVideosDesc': 'Saspiest video pirms sūtīšanas, lai samazinātu datu patēriņu',
  'settings.connected': 'Savienots',
  'settings.connecting': 'Savienojas',
  'settings.connectionStatus': 'Savienojuma statuss',
  'settings.copied': 'Nokopēts!',
  'settings.copyToClipboard': 'Kopēt starpliktuvē',
  'settings.defaultAudioQuality': 'Noklusējuma audio kvalitāte',
  'settings.defaultSpeaker': 'Noklusējuma skaļrunis',
  'settings.defaultVideoQuality': 'Noklusējuma video kvalitāte',
  'settings.detectedHardware': 'Noteiktā aparatūra',
  'settings.devicesAreAutoDetected': 'Ierīces tiek noteiktas automātiski. Izmaiņas tiek piemērotas reāllaikā.',
  'settings.disconnected': 'Atvienots',
  'settings.doNotDisturb': 'Netraucēt',
  'settings.doNotDisturbDesc': 'Izslēgt visus paziņojumus',
  'settings.doYouLikeAsgard': 'Vai jums patīk Asgard lietotne?',
  'settings.donationIn': 'Ziedot',
  'settings.enableNotifications': 'Iespējot paziņojumus',
  'settings.enableNotificationsDesc': 'Rādīt Windows paziņojumus par jauniem ziņojumiem',
  'settings.enableRelay': 'Iespējot retranslatoru',
  'settings.enableRelayDesc': 'Izmantot aklos retranslatorus, ja tiešie savienojumi nav pieejami',
  'settings.exportData': 'Eksportēt datus',
  'settings.flushDht': 'Iztukšot DHT',
  'settings.grantPermission': 'Piešķirt atļauju',
  'settings.grantPermissionDesc': 'Piešķiriet atļauju, lai redzētu ierīču nosaukumus un konfigurētu aparatūru.',
  'settings.hideRecoveryPhrase': 'Slēpt atgūšanas frāzi',
  'settings.highContrast': 'Augsts kontrasts',
  'settings.highContrastDesc': 'Palielināt kontrastu labākai redzamībai',
  'settings.importData': 'Importēt datus',
  'settings.inlinePreviews': 'Iekļautie priekšskatījumi',
  'settings.inlinePreviewsDesc': 'Rādīt attēlu priekšskatījumus tieši tērzēšanā',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Tastatūras navigācija',
  'settings.keyboardNavigationDesc': 'Rādīt īsceļus un fokusa indikatorus',
  'settings.largerTouchTargets': 'Lielāki skāriena mērķi',
  'settings.largerTouchTargetsDesc': 'Padarīt pogas un interaktīvos elementus vieglāk pieskarties',
  'settings.linkPreviews': 'Saišu priekšskatījumi',
  'settings.linkPreviewsDesc': 'Automātiski iegūt un rādīt saišu priekšskatījumus (var atklāt jūsu pārlūkošanas darbību)',
  'settings.localCache': 'Vietējā kešatmiņa',
  'settings.manageTrash': 'Pārvaldīt atkritni',
  'settings.maxPeers': 'Maksimālais biedru skaits',
  'settings.mbLimit': 'MB ierobežojums',
  'settings.mediaSubtitle': 'Konfigurējiet multivides atskaņošanu un saspiešanu',
  'settings.mentionsOnly': 'Tikai pieminējumi',
  'settings.mentionsOnlyDesc': 'Paziņot tikai par pieminējumiem un tiešajiem ziņojumiem',
  'settings.messageDensity': 'Ziņojumu blīvums',
  'settings.messagePreview': 'Ziņojuma priekšskatījums',
  'settings.messagePreviewDesc': 'Rādīt ziņojuma saturu paziņojumos',
  'settings.microphone': 'Mikrofons',
  'settings.microphoneAccess': 'Mikrofona un kameras piekļuve',
  'settings.microphoneUpdated': 'Mikrofons atjaunināts',
  'settings.microphones': 'Mikrofoni',
  'settings.muteByDefault': 'Pēc noklusējuma izslēgts',
  'settings.muteByDefaultDesc': 'Sākt video klusuma režīmā',
  'settings.networkSubtitle': 'P2P savienojuma iestatījumi',
  'settings.neverShareRecoveryPhrase': 'Nekad nedalieties ar savu atgūšanas frāzi!',
  'settings.new': 'Jauns',
  'settings.notAvailable': 'Nav pieejams',
  'settings.notificationSoundDesc': 'Atskaņot skaņu jauniem ziņojumiem',
  'settings.onlineStatus': 'Tiešsaistes statuss',
  'settings.onlineStatusDesc': 'Ļaujiet saviem kontaktiem redzēt jūsu tiešsaistes statusu',
  'settings.peerLatency': 'Biedru aizture',
  'settings.peerQuality': 'Biedru kvalitāte',
  'settings.peers': 'Biedri',
  'settings.readReceipts': 'Lasīšanas apstiprinājumi',
  'settings.readReceiptsDesc': 'Informēt citus, kad esat izlasījis viņu ziņojumus',
  'settings.recoveryPhrase': 'Atgūšanas frāze',
  'settings.recoveryPhraseDesc': 'Jūsu 24 vārdu atgūšanas frāzi var izmantot, lai atjaunotu jūsu identitāti citā ierīcē. Glabājiet to droši un nekad nedalieties ar to.',
  'settings.recoveryPhraseWarning': 'Ikviens ar šiem vārdiem var piekļūt jūsu kontam.',
  'settings.reducedMotion': 'Samazināt animācijas',
  'settings.reducedMotionDesc': 'Minimizēt animācijas un pārejas',
  'settings.screenReaderOptimizations': 'Ekrāna lasītāja optimizācija',
  'settings.screenReaderOptimizationsDesc': 'Uzlabots atbalsts ekrāna lasītājiem',
  'settings.securitySubtitle': 'Pārvaldiet savu identitāti un atgūšanas frāzi',
  'settings.sendOnEnter': 'Sūtīt ar Enter',
  'settings.sendOnEnterDesc': 'Nospiediet Enter, lai sūtītu, Shift+Enter jaunai rindai',
  'settings.showReadStatus': 'Rādīt lasīšanas statusu',
  'settings.showReadStatusDesc': 'Rādīt lasīšanas apstiprinājumus nosūtītajiem ziņojumiem',
  'settings.showRecoveryPhrase': 'Rādīt atgūšanas frāzi',
  'settings.showSeconds': 'Rādīt sekundes',
  'settings.showSecondsDesc': 'Iekļaut sekundes laika zīmogus',
  'settings.showTimestamps': 'Rādīt laika zīmogus',
  'settings.showTimestampsDesc': 'Rādīt laiku blakus katram ziņojumam',
  'settings.showVideoControls': 'Rādīt video vadīklas',
  'settings.showVideoControlsDesc': 'Rādīt atskaņošanas vadīklas video',
  'settings.speaker': 'Skaļrunis',
  'settings.speakerUpdated': 'Skaļrunis atjaunināts',
  'settings.speakers': 'Skaļruņi',
  'settings.stopTest': 'Apturēt testu',
  'settings.storageSubtitle': 'Pārvaldiet vietējos datus un lejupielādes',
  'settings.suspended': 'Apturēts',
  'settings.testCamera': 'Testēt kameru',
  'settings.testMic': 'Testēt mikrofonu',
  'settings.textToSpeech': 'Teksts uz runu',
  'settings.textToSpeechDesc': 'Lasīt ziņojumus skaļi',
  'settings.topics': 'Tēmas',
  'settings.tradeCryptocurrencyPrivately': 'Tirgot kriptovalūtu privāti',
  'settings.typingIndicators': 'Rakstīšanas indikatori',
  'settings.typingIndicatorsDesc': 'Ļaut citiem redzēt, kad jūs rakstāt',
  'settings.usedOf': 'izmantots no',
  'settings.videoQuality_auto': 'Automātisks',
  'settings.videoQuality_high': 'Augsta',
  'settings.videoQuality_low': 'Zema',
  'settings.videoQuality_medium': 'Vidēja',
  'settings.yourIdentity': 'Jūsu identitāte',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'lv') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (lvTranslations[key]) {
    const newValue = lvTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Latvian translations.`)
