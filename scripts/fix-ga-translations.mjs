import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const gaTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Uaslódáil grianghraf',
  'avatar.cropAvatar': 'Gearr avatar',
  'avatar.cancel': 'Cealaigh',
  'avatar.cropSave': 'Gearr agus sábháil',

  // ─── calls ───
  'calls.openChat': 'Comhrá',
  'calls.refreshServer': 'Athnuaigh nasc an fhreastalaí',
  'calls.noContactsFound': 'Níor aimsíodh aon teagmhálacha',
  'calls.startCallHint': 'Tosaigh glao ó liosta na dteagmhálacha',

  // ─── common ───
  'common.admin': 'Riarthóir',

  // ─── contacts ───
  'contacts.reloadContacts': 'Athlódáil teagmhálacha ó stóráil Hyperbee',
  'contacts.displayNameOptional': 'Ainm taispeána (roghnach)',
  'contacts.displayNamePlaceholder': 'Conas ba cheart dóibh feiceáil?',
  'contacts.selectContact': 'Roghnaigh teagmháil chun sonraí a fheiceáil',
  'contacts.noBlockedContacts': 'Níl aon teagmhálacha blocáilte',
  'contacts.noContactsFound': 'Níor aimsíodh aon teagmhálacha',
  'contacts.error.publicKeyRequired': 'Cuir isteach eochair phoiblí',
  'contacts.error.invalidPublicKey': 'Formáid eochrach poiblí neamhbhailí',
  'contacts.error.noIdentity': 'Níl aon aitheantas ar fáil',
  'contacts.error.noContactsFound': 'Níor aimsíodh aon teagmhálacha i stóráil Hyperbee',
  'contacts.error.failedToReload': 'Theip ar athlódáil teagmhálacha',

  // ─── groups ───
  'groups.admins': 'Riarthóirí',
  'groups.groups': 'Grúpaí',
  'groups.create': 'Cruthaigh',
  'groups.searchGroups': 'Cuardaigh grúpaí…',
  'groups.noGroupsFound': 'Níor aimsíodh aon ghrúpaí',
  'groups.noGroupsYet': 'Níl aon ghrúpaí fós',
  'groups.createGroupHint': 'Cruthaigh grúpa chun comhoibriú a thosú',
  'groups.createFirstGroup': 'Cruthaigh do chéad ghrúpa',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Cealaigh freagra',
  'messageInput.attachFile': 'Ceangail comhad',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Seol teachtaireacht',
  'messageInput.dropFiles': 'Buail comhaid anseo',
  'messageInput.replyingTo': 'Ag freagairt do',
  'messageInput.messageDeleted': 'Teachtaireacht scriosta',

  // ─── modal ───
  'modal.addContact': 'Cuir teagmháil leis',
  'modal.publicKey': 'Eochair phoiblí',
  'modal.publicKeyPlaceholder': 'Cuir isteach eochair phoiblí na teagmhála…',
  'modal.displayName': 'Ainm taispeána (roghnach)',
  'modal.displayNamePlaceholder': 'Tabhair ainm don teagmháil seo…',
  'modal.cancel': 'Cealaigh',
  'modal.add': 'Cuir leis',
  'modal.shareKey': 'Roinn d\'eochair phoiblí le do theagmháil ionas gur féidir leo tú a chur leis freisin. Gheobhaidh tú í i Socruithe → Próifíl.',
  'modal.error.publicKeyRequired': 'Tá eochair phoiblí riachtanach',
  'modal.error.publicKeyTooShort': 'Tá an eochair phoiblí ró-ghearr',
  'modal.error.contactExists': 'Tá an teagmháil ann cheana',

  // ─── panels ───
  'panels.info': 'Eolas',

  // ─── titlebar ───
  'titlebar.minimize': 'Íoslaghdaigh',
  'titlebar.maximize': 'Uasmhéadaigh',
  'titlebar.close': 'Dún',

  // ─── toast ───
  'toast.dismiss': 'Dún',
  'toast.dataImported': 'Sonraí iompórtáilte go rathúil',
  'toast.importFailed': 'Theip ar iompórtáil',
  'toast.invalidBackupFile': 'Comhad cúltaca neamhbhailí',
  'toast.cacheCleared': 'Taisce glanta',
  'toast.failedToClearCache': 'Theip ar glanadh na taisce',
  'toast.permissionGranted': 'Cead tugtha',
  'toast.permissionDenied': 'Cead diúltaithe',
  'toast.microphoneUpdated': 'Micreafón nuashonraithe',
  'toast.cameraUpdated': 'Ceamara nuashonraithe',
  'toast.speakerUpdated': 'Callaire nuashonraithe',
  'toast.cameraTestFailed': 'Theip ar thástáil an cheamara',
  'toast.addressCopied': 'Seoladh cóipeáilte go dtí an ghearrthaisce',
  'toast.failedToCopyAddress': 'Theip ar chóipeáil an tseolaidh',
  'toast.contactAdded': 'Teagmháil curtha leis — tosú braite',
  'toast.failedToAddContact': 'Theip ar chur leis an teagmháil',

  // ─── settings ───
  'settings.audio': 'Fuaim',
  'settings.fileType_audio': 'Fuaim',
  'settings.profile': 'Próifíl',
  'settings.appVersion': 'Leagan {{version}}',
  'settings.accessibilitySubtitle': 'Déan Asgard níos inrochtana duit',
  'settings.atTheFollowingAddress': 'ag an seoladh seo a leanas:',
  'settings.audioQuality_high': 'Ard',
  'settings.audioQuality_low': 'Íseal',
  'settings.audioQuality_medium': 'Meánach',
  'settings.autoDownload': 'Íoslódáil uathoibríoch',
  'settings.autoDownloadAudioDesc': 'Íoslódáil teachtaireachtaí fuaime go huathoibríoch',
  'settings.autoDownloadImagesDesc': 'Íoslódáil íomhánna go huathoibríoch',
  'settings.autoDownloadVideosDesc': 'Íoslódáil físeáin go huathoibríoch',
  'settings.autoEmoji': 'Emoji uathoibríoch',
  'settings.autoEmojiDesc': 'Tiontaigh aicearraí téacs mar :) go emoji',
  'settings.autoPlayGifs': 'Seinn GIFs go huathoibríoch',
  'settings.autoPlayGifsDesc': 'Beoigh íomhánna GIF go huathoibríoch',
  'settings.autoPlayVideos': 'Seinn físeáin go huathoibríoch',
  'settings.autoPlayVideosDesc': 'Seinn físeáin go huathoibríoch nuair atá siad le feiceáil',
  'settings.bandwidth': 'Bandaleithead',
  'settings.batterySaver': 'Coigilteoir ceallraí',
  'settings.batterySaverDesc': 'Cuir P2P ar fionraí nuair atá an aip sa chúlra',
  'settings.builtWith': 'Tógtha le: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Ceamara',
  'settings.cameraTestFailed': 'Theip ar thástáil an cheamara',
  'settings.cameraUpdated': 'Ceamara nuashonraithe',
  'settings.cameras': 'Ceamaraí',
  'settings.chatDensity_comfortable': 'Compordach',
  'settings.chatDensity_compact': 'Dlúth',
  'settings.chatDensity_cozy': 'Compordach',
  'settings.chatSubtitle': 'Cumraigh do thaithí comhrá',
  'settings.clearCache': 'Glan taisce',
  'settings.clickToCopy': 'Cliceáil chun cóipeáil',
  'settings.collapseMessages': 'Comhbhrúigh teachtaireachtaí',
  'settings.collapseMessagesDesc': 'Grúpáil teachtaireachtaí as a chéile ón seoltóir céanna',
  'settings.compressImages': 'Comhbhrúigh íomhánna',
  'settings.compressImagesDesc': 'Comhbhrúigh íomhánna roimh sheoladh',
  'settings.compressVideos': 'Comhbhrúigh físeáin',
  'settings.compressVideosDesc': 'Comhbhrúigh físeáin roimh sheoladh chun úsáid sonraí a laghdú',
  'settings.connected': 'Ceangailte',
  'settings.connecting': 'Ag ceangal',
  'settings.connectionStatus': 'Stádas ceangail',
  'settings.copied': 'Cóipeáilte!',
  'settings.copyToClipboard': 'Cóipeáil go dtí an ghearrthaisce',
  'settings.defaultAudioQuality': 'Cáilíocht fuaime réamhshocraithe',
  'settings.defaultSpeaker': 'Callaire réamhshocraithe',
  'settings.defaultVideoQuality': 'Cáilíocht físeáin réamhshocraithe',
  'settings.detectedHardware': 'Crua-earraí braite',
  'settings.devicesAreAutoDetected': 'Braitear gléasanna go huathoibríoch. Cuirtear athruithe i bhfeidhm go fíor-am.',
  'settings.disconnected': 'Dícheangailte',
  'settings.doNotDisturb': 'Ná cuir isteach',
  'settings.doNotDisturbDesc': 'Múch gach fógra',
  'settings.doYouLikeAsgard': 'An maith leat an aip Asgard?',
  'settings.donationIn': 'Deontas i',
  'settings.enableNotifications': 'Cumasaigh fógraí',
  'settings.enableNotificationsDesc': 'Taispeáin fógraí Windows do theachtaireachtaí nua',
  'settings.enableRelay': 'Cumasaigh athchraoladh',
  'settings.enableRelayDesc': 'Úsáid athchraoltóirí dall nuair nach bhfuil naisc dhíreacha ar fáil',
  'settings.exportData': 'Easpórtáil sonraí',
  'settings.flushDht': 'Folmhaigh DHT',
  'settings.grantPermission': 'Deonaigh cead',
  'settings.grantPermissionDesc': 'Deonaigh cead chun ainmneacha gléasanna a fheiceáil agus do chrua-earraí a chumrú.',
  'settings.hideRecoveryPhrase': 'Folaigh frása aisghabhála',
  'settings.highContrast': 'Codarsacht ard',
  'settings.highContrastDesc': 'Méadaigh codarsnacht le haghaidh infheictheacht níos fearr',
  'settings.importData': 'Iompórtáil sonraí',
  'settings.inlinePreviews': 'Réamhamhairc inlíne',
  'settings.inlinePreviewsDesc': 'Taispeáin réamhamhairc íomhánna go díreach sa chomhrá',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Nascleanúint méarchláir',
  'settings.keyboardNavigationDesc': 'Taispeáin aicearraí méarchláir agus táscairí fócais',
  'settings.largerTouchTargets': 'Spriocanna tadhaill níos mó',
  'settings.largerTouchTargetsDesc': 'Déan cnaipí agus eilimintí idirghníomhacha níos éasca le tadhaill',
  'settings.linkPreviews': 'Réamhamhairc nasc',
  'settings.linkPreviewsDesc': 'Faigh agus taispeáin réamhamhairc nasc go huathoibríoch (d\'fhéadfadh sé do ghníomhaíocht brabhsála a nochtadh)',
  'settings.localCache': 'Taisce áitiúil',
  'settings.manageTrash': 'Bainistigh bruscar',
  'settings.maxPeers': 'Uasmhéid piaraí',
  'settings.mbLimit': 'Teorainn MB',
  'settings.mediaSubtitle': 'Cumraigh athsheinm agus comhbhrú meán',
  'settings.mentionsOnly': 'Luanna amháin',
  'settings.mentionsOnlyDesc': 'Fógra a thabhairt ach amháin le haghaidh luanna agus teachtaireachtaí díreacha',
  'settings.messageDensity': 'Dlús teachtaireachtaí',
  'settings.messagePreview': 'Réamhamharc teachtaireachta',
  'settings.messagePreviewDesc': 'Taispeáin ábhar teachtaireachta sna fógraí',
  'settings.microphone': 'Micreafón',
  'settings.microphoneAccess': 'Rochtain micreafóin agus ceamara',
  'settings.microphoneUpdated': 'Micreafón nuashonraithe',
  'settings.microphones': 'Micreafóin',
  'settings.muteByDefault': 'Balbhaithe de réir réamhshocraithe',
  'settings.muteByDefaultDesc': 'Tosaigh físeáin i mód balbhaithe',
  'settings.networkSubtitle': 'Socruithe ceangail P2P',
  'settings.neverShareRecoveryPhrase': 'Ná roinn do fhrása aisghabhála riamh!',
  'settings.new': 'Nua',
  'settings.notAvailable': 'Níl ar fáil',
  'settings.notificationSoundDesc': 'Seinn fuaim do theachtaireachtaí nua',
  'settings.onlineStatus': 'Stádas ar líne',
  'settings.onlineStatusDesc': 'Lig do do theagmhálacha do stádas ar líne a fheiceáil',
  'settings.peerLatency': 'Moill piaraí',
  'settings.peerQuality': 'Cáilíocht piaraí',
  'settings.peers': 'Piaraí',
  'settings.readReceipts': 'Admhálacha léite',
  'settings.readReceiptsDesc': 'Cuir in iúl do dhaoine eile nuair a léann tú a dteachtaireachtaí',
  'settings.recoveryPhrase': 'Frása aisghabhála',
  'settings.recoveryPhraseDesc': 'Is féidir do fhrása aisghabhála 24 focal a úsáid chun d\'aitheantas a aischur ar ghléas eile. Coinnigh slán é agus ná roinn le duine ar bith é riamh.',
  'settings.recoveryPhraseWarning': 'Is féidir le haon duine leis na focail seo rochtain a fháil ar do chuntas.',
  'settings.reducedMotion': 'Laghdaigh beochan',
  'settings.reducedMotionDesc': 'Íoslaghdaigh beochana agus aistrithe',
  'settings.screenReaderOptimizations': 'Optamuithe léitheoir scáileáin',
  'settings.screenReaderOptimizationsDesc': 'Tacaíocht fheabhsaithe do léitheoirí scáileáin',
  'settings.securitySubtitle': 'Bainistigh d\'aitheantas agus frása aisghabhála',
  'settings.sendOnEnter': 'Seol le Enter',
  'settings.sendOnEnterDesc': 'Brúigh Enter chun seoladh, Shift+Enter le haghaidh líne nua',
  'settings.showReadStatus': 'Taispeáin stádas léite',
  'settings.showReadStatusDesc': 'Taispeáin admhálacha léite ar theachtaireachtaí seolta',
  'settings.showRecoveryPhrase': 'Taispeáin frása aisghabhála',
  'settings.showSeconds': 'Taispeáin soicindí',
  'settings.showSecondsDesc': 'Cuir soicindí san áireamh i stampaí ama',
  'settings.showTimestamps': 'Taispeáin stampaí ama',
  'settings.showTimestampsDesc': 'Taispeáin an t-am in aice le gach teachtaireacht',
  'settings.showVideoControls': 'Taispeáin rialuithe físeáin',
  'settings.showVideoControlsDesc': 'Taispeáin rialuithe athsheinmtha ar fhíseáin',
  'settings.speaker': 'Callaire',
  'settings.speakerUpdated': 'Callaire nuashonraithe',
  'settings.speakers': 'Callairí',
  'settings.stopTest': 'Stad tástáil',
  'settings.storageSubtitle': 'Bainistigh sonraí áitiúla agus íoslódálacha',
  'settings.suspended': 'Ar fionraí',
  'settings.testCamera': 'Tástáil ceamara',
  'settings.testMic': 'Tástáil micreafón',
  'settings.textToSpeech': 'Téacs go caint',
  'settings.textToSpeechDesc': 'Léigh teachtaireachtaí os ard',
  'settings.topics': 'Topaicí',
  'settings.tradeCryptocurrencyPrivately': 'Trádáil cryptocurrency go príobháideach',
  'settings.typingIndicators': 'Táscairí clóscríofa',
  'settings.typingIndicatorsDesc': 'Lig do dhaoine eile a fheiceáil nuair atá tú ag clóscríobh',
  'settings.usedOf': 'in úsáid as',
  'settings.videoQuality_auto': 'Uathoibríoch',
  'settings.videoQuality_high': 'Ard',
  'settings.videoQuality_low': 'Íseal',
  'settings.videoQuality_medium': 'Meánach',
  'settings.yourIdentity': 'D\'aitheantas',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'ga') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (gaTranslations[key]) {
    const newValue = gaTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Irish translations.`)
