import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const mtTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Tella\' ritratt',
  'avatar.cropAvatar': 'Aqta\' l-avatar',
  'avatar.cancel': 'Ikkanċella',
  'avatar.cropSave': 'Aqta\' u żżomm',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Aġġorna l-konnessjoni tas-server',
  'calls.noContactsFound': 'Ma nstabu l-ebda kuntatti',
  'calls.startCallHint': 'Ibda sejħa mil-lista tal-kuntatti',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Erġa\' ittella\' l-kuntatti mill-ħażna Hyperbee',
  'contacts.displayNameOptional': 'Isem li jidher (fakultattiv)',
  'contacts.displayNamePlaceholder': 'Kif għandhom jidhru?',
  'contacts.selectContact': 'Agħżel kuntatt biex tara d-dettalji',
  'contacts.noBlockedContacts': 'L-ebda kuntatti mblukkati',
  'contacts.noContactsFound': 'Ma nstabu l-ebda kuntatti',
  'contacts.error.publicKeyRequired': 'Daħħal ċavetta pubblika',
  'contacts.error.invalidPublicKey': 'Format ta\' ċavetta pubblika invalidu',
  'contacts.error.noIdentity': 'L-ebda identità disponibbli',
  'contacts.error.noContactsFound': 'Ma nstabu l-ebda kuntatti fil-ħażna Hyperbee',
  'contacts.error.failedToReload': 'Ma rnexxiex jerġgħu jitgħabbew il-kuntatti',

  // ─── groups ───
  'groups.admins': 'Amministraturi',
  'groups.groups': 'Gruppi',
  'groups.create': 'Oħloq',
  'groups.searchGroups': 'Fittex gruppi…',
  'groups.noGroupsFound': 'Ma nstabu l-ebda gruppi',
  'groups.noGroupsYet': 'Għad m\'hemm l-ebda gruppi',
  'groups.createGroupHint': 'Oħloq grupp biex tibda tikkoopera',
  'groups.createFirstGroup': 'Oħloq l-ewwel grupp tiegħek',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Ikkanċella r-risposta',
  'messageInput.attachFile': 'Waħħal fajl',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Ibgħat messaġġ',
  'messageInput.dropFiles': 'Waqqagħ il-fajls hawn',
  'messageInput.replyingTo': 'Tirrispondi lil',
  'messageInput.messageDeleted': 'Messaġġ imħassar',

  // ─── modal ───
  'modal.addContact': 'Żid kuntatt',
  'modal.publicKey': 'Ċavetta pubblika',
  'modal.publicKeyPlaceholder': 'Daħħal iċ-ċavetta pubblika tal-kuntatt…',
  'modal.displayName': 'Isem li jidher (fakultattiv)',
  'modal.displayNamePlaceholder': 'Agħti isem lil dan il-kuntatt…',
  'modal.cancel': 'Ikkanċella',
  'modal.add': 'Żid',
  'modal.shareKey': 'Aqsam iċ-ċavetta pubblika tiegħek mal-kuntatt tiegħek sabiex huma wkoll ikunu jistgħu jżiduk. Issibha f\'Settings → Profil.',
  'modal.error.publicKeyRequired': 'Iċ-ċavetta pubblika hija meħtieġa',
  'modal.error.publicKeyTooShort': 'Iċ-ċavetta pubblika hija qasira wisq',
  'modal.error.contactExists': 'Il-kuntatt diġà jeżisti',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimizza',
  'titlebar.maximize': 'Massimizza',
  'titlebar.close': 'Agħlaq',

  // ─── toast ───
  'toast.dismiss': 'Agħlaq',
  'toast.dataImported': 'Data importata b\'suċċess',
  'toast.importFailed': 'L-importazzjoni falliet',
  'toast.invalidBackupFile': 'Fajl ta\' backup invalidu',
  'toast.cacheCleared': 'Il-cache tħassad',
  'toast.failedToClearCache': 'Ma rnexxiex jitħassar il-cache',
  'toast.permissionGranted': 'Permess mogħti',
  'toast.permissionDenied': 'Permess miċħud',
  'toast.microphoneUpdated': 'Mikrofonu aġġornat',
  'toast.cameraUpdated': 'Kamera aġġornata',
  'toast.speakerUpdated': 'Spiker aġġornat',
  'toast.cameraTestFailed': 'It-test tal-kamera falla',
  'toast.addressCopied': 'L-indirizz ikkupjat fil-clipboard',
  'toast.failedToCopyAddress': 'Ma rnexxiex jikkopja l-indirizz',
  'toast.contactAdded': 'Kuntatt miżjud — skoperta bdiet',
  'toast.failedToAddContact': 'Ma rnexxiex iżid il-kuntatt',

  // ─── settings ───
  'settings.audio': 'Awdjo',
  'settings.fileType_audio': 'Awdjo',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Verżjoni {{version}}',
  'settings.accessibilitySubtitle': 'Agħmel Asgard aktar aċċessibbli għalik',
  'settings.atTheFollowingAddress': 'fl-indirizz li ġej:',
  'settings.audioQuality_high': 'Għolja',
  'settings.audioQuality_low': 'Baxxa',
  'settings.audioQuality_medium': 'Medja',
  'settings.autoDownload': 'Tniżżil awtomatiku',
  'settings.autoDownloadAudioDesc': 'Niżżel messaġġi awdjo awtomatikament',
  'settings.autoDownloadImagesDesc': 'Niżżel stampi awtomatikament',
  'settings.autoDownloadVideosDesc': 'Niżżel vidjows awtomatikament',
  'settings.autoEmoji': 'Emoji awtomatiċi',
  'settings.autoEmojiDesc': 'Ikkonverti shortcuts tat-test bħal :) f\'emoji',
  'settings.autoPlayGifs': 'Awtomatikament erġa\' ħaddem GIFs',
  'settings.autoPlayGifsDesc': 'Animazzjoni awtomatika ta\' stampi GIF',
  'settings.autoPlayVideos': 'Erġa\' ħaddem vidjows awtomatikament',
  'settings.autoPlayVideosDesc': 'Erġa\' ħaddem vidjows awtomatikament meta jkunu viżibbli',
  'settings.bandwidth': 'Wisa\' tal-faxxa',
  'settings.batterySaver': 'Iffrankar tal-batterija',
  'settings.batterySaverDesc': 'Issospendi P2P meta l-app tkun fl-isfond',
  'settings.builtWith': 'Mibnija b\': Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'It-test tal-kamera falla',
  'settings.cameraUpdated': 'Kamera aġġornata',
  'settings.cameras': 'Kameras',
  'settings.chatDensity_comfortable': 'Komdu',
  'settings.chatDensity_compact': 'Kompatt',
  'settings.chatDensity_cozy': 'Komdu',
  'settings.chatSubtitle': 'Ikkonfigura l-esperjenza taċ-chat tiegħek',
  'settings.clearCache': 'Neħħi l-cache',
  'settings.clickToCopy': 'Ikklikkja biex tikkopja',
  'settings.collapseMessages': 'Naqqas messaġġi',
  'settings.collapseMessagesDesc': 'Iggruppa messaġġi konsekuttivi mill-istess mittent',
  'settings.compressImages': 'Ikkompressa stampi',
  'settings.compressImagesDesc': 'Ikkompressa stampi qabel ma tibgħat',
  'settings.compressVideos': 'Ikkompressa vidjows',
  'settings.compressVideosDesc': 'Ikkompressa vidjows qabel ma tibgħat biex tnaqqas l-użu tad-data',
  'settings.connected': 'Konness',
  'settings.connecting': 'Jgħaqqad',
  'settings.connectionStatus': 'Stat tal-konnessjoni',
  'settings.copied': 'Ikkupjat!',
  'settings.copyToClipboard': 'Ikkopja fil-clipboard',
  'settings.defaultAudioQuality': 'Kwalità awdjo default',
  'settings.defaultSpeaker': 'Spiker default',
  'settings.defaultVideoQuality': 'Kwalità vidjo default',
  'settings.detectedHardware': 'Hardware misjub',
  'settings.devicesAreAutoDetected': 'Apparati jinstabu awtomatikament. Il-bidliet jiġu applikati f\'ħin reali.',
  'settings.disconnected': 'Skonnettjat',
  'settings.doNotDisturb': 'Tiddisturbax',
  'settings.doNotDisturbDesc': 'Trażżan l-avviżi kollha',
  'settings.doYouLikeAsgard': 'Togħġbok l-app Asgard?',
  'settings.donationIn': 'Agħti donazzjoni',
  'settings.enableNotifications': 'Attiva l-avviżi',
  'settings.enableNotificationsDesc': 'Uri avviżi Windows għal messaġġi ġodda',
  'settings.enableRelay': 'Attiva relay',
  'settings.enableRelayDesc': 'Uża relays għomja meta l-konnessjonijiet diretti ma jkunux disponibbli',
  'settings.exportData': 'Esporta d-data',
  'settings.flushDht': 'VoJta DHT',
  'settings.grantPermission': 'Agħti permess',
  'settings.grantPermissionDesc': 'Agħti permess biex tara l-ismijiet tal-apparati u tikkonfigura l-hardware tiegħek.',
  'settings.hideRecoveryPhrase': 'Aħbi l-frażi ta\' rkupru',
  'settings.highContrast': 'Kontrast għoli',
  'settings.highContrastDesc': 'Żid il-kuntrast għal viżibilità aħjar',
  'settings.importData': 'Importa d-data',
  'settings.inlinePreviews': 'Previews integrati',
  'settings.inlinePreviewsDesc': 'Uri previews ta\' stampi direttament fiċ-chat',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Navigazzjoni bil-keyboard',
  'settings.keyboardNavigationDesc': 'Uri shortcuts tal-keyboard u indikaturi tal-fokus',
  'settings.largerTouchTargets': 'Miri tal-mess akbar',
  'settings.largerTouchTargetsDesc': 'Agħmel il-buttuni u l-elementi interattivi aktar faċli biex tmiss',
  'settings.linkPreviews': 'Previews tal-links',
  'settings.linkPreviewsDesc': 'Ikseb u uri previews tal-links awtomatikament (jista\' jiżvela l-attività tal-browsing tiegħek)',
  'settings.localCache': 'Cache lokali',
  'settings.manageTrash': 'Immaniġġja l-iskart',
  'settings.maxPeers': 'Numru massimu ta\' peers',
  'settings.mbLimit': 'Limitu MB',
  'settings.mediaSubtitle': 'Ikkonfigura l-plejbak u l-kompressjoni tal-media',
  'settings.mentionsOnly': 'Sejħiet biss',
  'settings.mentionsOnlyDesc': 'Avża biss għal sejħiet u messaġġi diretti',
  'settings.messageDensity': 'Densità tal-messaġġi',
  'settings.messagePreview': 'Preview tal-messaġġ',
  'settings.messagePreviewDesc': 'Uri l-kontenut tal-messaġġ fl-avviżi',
  'settings.microphone': 'Mikrofonu',
  'settings.microphoneAccess': 'Aċċess għall-mikrofonu u l-kamera',
  'settings.microphoneUpdated': 'Mikrofonu aġġornat',
  'settings.microphones': 'Mikrofoni',
  'settings.muteByDefault': 'Mut b\'mod default',
  'settings.muteByDefaultDesc': 'Ibda l-vidjows f\'mod mut',
  'settings.networkSubtitle': 'Settings tal-konnessjoni P2P',
  'settings.neverShareRecoveryPhrase': 'Qatt taqsam il-frażi ta\' rkupru tiegħek!',
  'settings.new': 'Ġdid',
  'settings.notAvailable': 'Mhux disponibbli',
  'settings.notificationSoundDesc': 'Doqq ħoss għal messaġġi ġodda',
  'settings.onlineStatus': 'Stat online',
  'settings.onlineStatusDesc': 'Ħalli l-kuntatti tiegħek jaraw l-istat online tiegħek',
  'settings.peerLatency': 'Latency tal-peers',
  'settings.peerQuality': 'Kwalità tal-peers',
  'settings.peers': 'Peers',
  'settings.readReceipts': 'Rċevuti tal-qari',
  'settings.readReceiptsDesc': 'Informa lill-oħrajn meta taqra l-messaġġi tagħhom',
  'settings.recoveryPhrase': 'Frażi ta\' rkupru',
  'settings.recoveryPhraseDesc': 'Il-frażi ta\' rkupru ta\' 24 kelma tiegħek tista\' tintuża biex terġa\' tikseb l-identità tiegħek fuq apparat ieħor. Żommha sigura u qatt taqsamha.',
  'settings.recoveryPhraseWarning': 'Kulħadd b\'dawn il-kliem jista\' jaċċessa l-kont tiegħek.',
  'settings.reducedMotion': 'Naqqas l-animazzjonijiet',
  'settings.reducedMotionDesc': 'Minimizza l-animazzjonijiet u t-transizzjonijiet',
  'settings.screenReaderOptimizations': 'Ottimizzazzjonijiet tal-qarrej tal-iskrin',
  'settings.screenReaderOptimizationsDesc': 'Appoġġ imtejjeb għal qarrejja tal-iskrin',
  'settings.securitySubtitle': 'Immaniġġja l-identità u l-frażi ta\' rkupru tiegħek',
  'settings.sendOnEnter': 'Ibgħat b\'Enter',
  'settings.sendOnEnterDesc': 'Agħfas Enter biex tibgħat, Shift+Enter għal linja ġdida',
  'settings.showReadStatus': 'Uri l-istat tal-qari',
  'settings.showReadStatusDesc': 'Uri rċevuti tal-qari fuq messaġġi mibgħuta',
  'settings.showRecoveryPhrase': 'Uri l-frażi ta\' rkupru',
  'settings.showSeconds': 'Uri s-sekondi',
  'settings.showSecondsDesc': 'Inkludi s-sekondi fiċ-ċombi tal-ħin',
  'settings.showTimestamps': 'Uri ċ-ċombi tal-ħin',
  'settings.showTimestampsDesc': 'Uri l-ħin ħdejn kull messaġġ',
  'settings.showVideoControls': 'Uri l-kontrolli tal-vidjo',
  'settings.showVideoControlsDesc': 'Uri l-kontrolli tal-plejbak fuq il-vidjows',
  'settings.speaker': 'Spiker',
  'settings.speakerUpdated': 'Spiker aġġornat',
  'settings.speakers': 'Spikers',
  'settings.stopTest': 'Waqqaf it-test',
  'settings.storageSubtitle': 'Immaniġġja data lokali u downloads',
  'settings.suspended': 'Sospiż',
  'settings.testCamera': 'Ittestja l-kamera',
  'settings.testMic': 'Ittestja l-mikrofonu',
  'settings.textToSpeech': 'Test għal kliem',
  'settings.textToSpeechDesc': 'Aqra l-messaġġi bil-vuċi',
  'settings.topics': 'Suġġetti',
  'settings.tradeCryptocurrencyPrivately': 'Ikummerċja kriptovaluta b\'mod privat',
  'settings.typingIndicators': 'Indikaturi tal-kitba',
  'settings.typingIndicatorsDesc': 'Ħalli lill-oħrajn jaraw meta tkun qed tikteb',
  'settings.usedOf': 'użat minn',
  'settings.videoQuality_auto': 'Awtomatiku',
  'settings.videoQuality_high': 'Għolja',
  'settings.videoQuality_low': 'Baxxa',
  'settings.videoQuality_medium': 'Medja',
  'settings.yourIdentity': 'L-identità tiegħek',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'mt') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (mtTranslations[key]) {
    const newValue = mtTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Maltese translations.`)
