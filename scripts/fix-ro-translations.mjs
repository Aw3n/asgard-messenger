import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const roTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Încarcă foto',
  'avatar.cropAvatar': 'Decupează avatarul',
  'avatar.cancel': 'Anulează',
  'avatar.cropSave': 'Decupează și salvează',

  // ─── calls ───
  'calls.openChat': 'Conversație',
  'calls.refreshServer': 'Actualizează conexiunea la server',
  'calls.noContactsFound': 'Nu s-au găsit contacte',
  'calls.startCallHint': 'Începe un apel din lista de contacte',

  // ─── common ───
  'common.admin': 'Administrator',

  // ─── contacts ───
  'contacts.reloadContacts': 'Reîncarcă contactele din stocarea Hyperbee',
  'contacts.displayNameOptional': 'Nume afișat (opțional)',
  'contacts.displayNamePlaceholder': 'Cum ar trebui să apară?',
  'contacts.selectContact': 'Selectează un contact pentru a vedea detaliile',
  'contacts.noBlockedContacts': 'Niciun contact blocat',
  'contacts.noContactsFound': 'Nu s-au găsit contacte',
  'contacts.error.publicKeyRequired': 'Introdu o cheie publică',
  'contacts.error.invalidPublicKey': 'Format cheie publică invalid',
  'contacts.error.noIdentity': 'Nicio identitate disponibilă',
  'contacts.error.noContactsFound': 'Nu s-au găsit contacte în stocarea Hyperbee',
  'contacts.error.failedToReload': 'Reîncărcarea contactelor a eșuat',

  // ─── groups ───
  'groups.admins': 'Administratori',
  'groups.groups': 'Grupuri',
  'groups.create': 'Creează',
  'groups.searchGroups': 'Caută grupuri…',
  'groups.noGroupsFound': 'Nu s-au găsit grupuri',
  'groups.noGroupsYet': 'Niciun grup încă',
  'groups.createGroupHint': 'Creează un grup pentru a începe colaborarea',
  'groups.createFirstGroup': 'Creează primul tău grup',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Anulează răspunsul',
  'messageInput.attachFile': 'Atașează fișier',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Trimite mesajul',
  'messageInput.dropFiles': 'Plasează fișiere aici',
  'messageInput.replyingTo': 'Răspuns către',
  'messageInput.messageDeleted': 'Mesaj șters',

  // ─── modal ───
  'modal.addContact': 'Adaugă contact',
  'modal.publicKey': 'Cheie publică',
  'modal.publicKeyPlaceholder': 'Introdu cheia publică a contactului…',
  'modal.displayName': 'Nume afișat (opțional)',
  'modal.displayNamePlaceholder': 'Dă un nume acestui contact…',
  'modal.cancel': 'Anulează',
  'modal.add': 'Adaugă',
  'modal.shareKey': 'Partajează cheia ta publică cu contactul tău pentru a te putea adăuga și ei. O găsești în Setări → Profil.',
  'modal.error.publicKeyRequired': 'Cheia publică este obligatorie',
  'modal.error.publicKeyTooShort': 'Cheia publică este prea scurtă',
  'modal.error.contactExists': 'Contactul există deja',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimizează',
  'titlebar.maximize': 'Maximizează',
  'titlebar.close': 'Închide',

  // ─── toast ───
  'toast.dismiss': 'Închide',
  'toast.dataImported': 'Date importate cu succes',
  'toast.importFailed': 'Importul a eșuat',
  'toast.invalidBackupFile': 'Fișier de backup invalid',
  'toast.cacheCleared': 'Memoria cache golită',
  'toast.failedToClearCache': 'Golirea memoriei cache a eșuat',
  'toast.permissionGranted': 'Permisiune acordată',
  'toast.permissionDenied': 'Permisiune refuzată',
  'toast.microphoneUpdated': 'Microfon actualizat',
  'toast.cameraUpdated': 'Cameră actualizată',
  'toast.speakerUpdated': 'Difuzor actualizat',
  'toast.cameraTestFailed': 'Testul camerei a eșuat',
  'toast.addressCopied': 'Adresa copiată în clipboard',
  'toast.failedToCopyAddress': 'Copierea adresei a eșuat',
  'toast.contactAdded': 'Contact adăugat — descoperire pornită',
  'toast.failedToAddContact': 'Adăugarea contactului a eșuat',

  // ─── settings ───
  'settings.audio': 'Audio',
  'settings.fileType_audio': 'Audio',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Versiune {{version}}',
  'settings.accessibilitySubtitle': 'Fă Asgard mai accesibil pentru tine',
  'settings.atTheFollowingAddress': 'la următoarea adresă:',
  'settings.audioQuality_high': 'Înaltă',
  'settings.audioQuality_low': 'Joasă',
  'settings.audioQuality_medium': 'Medie',
  'settings.autoDownload': 'Descărcare automată',
  'settings.autoDownloadAudioDesc': 'Descarcă automat mesajele audio',
  'settings.autoDownloadImagesDesc': 'Descarcă automat imaginile',
  'settings.autoDownloadVideosDesc': 'Descarcă automat videoclipurile',
  'settings.autoEmoji': 'Emoji automat',
  'settings.autoEmojiDesc': 'Convertește scurtăturile de text precum :) în emoji',
  'settings.autoPlayGifs': 'Redă automat GIF-urile',
  'settings.autoPlayGifsDesc': 'Animează automat imaginile GIF',
  'settings.autoPlayVideos': 'Redă automat videoclipurile',
  'settings.autoPlayVideosDesc': 'Redă automat videoclipurile când sunt vizibile',
  'settings.bandwidth': 'Lățime de bandă',
  'settings.batterySaver': 'Economisire baterie',
  'settings.batterySaverDesc': 'Suspendă P2P când aplicația este în fundal',
  'settings.builtWith': 'Construit cu: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Cameră',
  'settings.cameraTestFailed': 'Testul camerei a eșuat',
  'settings.cameraUpdated': 'Cameră actualizată',
  'settings.cameras': 'Camere',
  'settings.chatDensity_comfortable': 'Confortabil',
  'settings.chatDensity_compact': 'Compact',
  'settings.chatDensity_cozy': 'Confortabil',
  'settings.chatSubtitle': 'Configurează experiența ta de conversație',
  'settings.clearCache': 'Golește memoria cache',
  'settings.clickToCopy': 'Click pentru a copia',
  'settings.collapseMessages': 'Restrânge mesajele',
  'settings.collapseMessagesDesc': 'Grupează mesajele consecutive de la același expeditor',
  'settings.compressImages': 'Comprimă imaginile',
  'settings.compressImagesDesc': 'Comprimă imaginile înainte de trimitere',
  'settings.compressVideos': 'Comprimă videoclipurile',
  'settings.compressVideosDesc': 'Comprimă videoclipurile înainte de trimitere pentru a reduce utilizarea datelor',
  'settings.connected': 'Conectat',
  'settings.connecting': 'Se conectează',
  'settings.connectionStatus': 'Starea conexiunii',
  'settings.copied': 'Copiat!',
  'settings.copyToClipboard': 'Copiază în clipboard',
  'settings.defaultAudioQuality': 'Calitate audio implicită',
  'settings.defaultSpeaker': 'Difuzor implicit',
  'settings.defaultVideoQuality': 'Calitate video implicită',
  'settings.detectedHardware': 'Hardware detectat',
  'settings.devicesAreAutoDetected': 'Dispozitivele sunt detectate automat. Modificările se aplică în timp real.',
  'settings.disconnected': 'Deconectat',
  'settings.doNotDisturb': 'Nu deranja',
  'settings.doNotDisturbDesc': 'Suprimă toate notificările',
  'settings.doYouLikeAsgard': 'Îți place aplicația Asgard?',
  'settings.donationIn': 'Donează în',
  'settings.enableNotifications': 'Activează notificările',
  'settings.enableNotificationsDesc': 'Afișează notificări Windows pentru mesaje noi',
  'settings.enableRelay': 'Activează retransmisia',
  'settings.enableRelayDesc': 'Folosește relee oarbe când conexiunile directe nu sunt disponibile',
  'settings.exportData': 'Exportă datele',
  'settings.flushDht': 'Golește DHT',
  'settings.grantPermission': 'Acordă permisiunea',
  'settings.grantPermissionDesc': 'Acordă permisiunea pentru a vedea numele dispozitivelor și a configura hardware-ul.',
  'settings.hideRecoveryPhrase': 'Ascunde fraza de recuperare',
  'settings.highContrast': 'Contrast ridicat',
  'settings.highContrastDesc': 'Crește contrastul pentru vizibilitate mai bună',
  'settings.importData': 'Importă datele',
  'settings.inlinePreviews': 'Previzualizări integrate',
  'settings.inlinePreviewsDesc': 'Afișează previzualizări ale imaginilor direct în conversație',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Navigare cu tastatura',
  'settings.keyboardNavigationDesc': 'Afișează scurtături de tastatură și indicatori de focus',
  'settings.largerTouchTargets': 'Ținte tactile mai mari',
  'settings.largerTouchTargetsDesc': 'Fă butoanele și elementele interactive mai ușor de atins',
  'settings.linkPreviews': 'Previzualizări linkuri',
  'settings.linkPreviewsDesc': 'Obține și afișează automat previzualizări ale linkurilor (poate dezvălui activitatea ta de navigare)',
  'settings.localCache': 'Cache local',
  'settings.manageTrash': 'Gestionează coșul de gunoi',
  'settings.maxPeers': 'Număr maxim de perechi',
  'settings.mbLimit': 'Limită MB',
  'settings.mediaSubtitle': 'Configurează redarea și comprimarea media',
  'settings.mentionsOnly': 'Doar mențiuni',
  'settings.mentionsOnlyDesc': 'Notifică doar pentru mențiuni și mesaje directe',
  'settings.messageDensity': 'Densitatea mesajelor',
  'settings.messagePreview': 'Previzualizare mesaj',
  'settings.messagePreviewDesc': 'Afișează conținutul mesajului în notificări',
  'settings.microphone': 'Microfon',
  'settings.microphoneAccess': 'Acces microfon și cameră',
  'settings.microphoneUpdated': 'Microfon actualizat',
  'settings.microphones': 'Microfoane',
  'settings.muteByDefault': 'Mut implicit',
  'settings.muteByDefaultDesc': 'Pornește videoclipurile în mod mut',
  'settings.networkSubtitle': 'Setări conexiune P2P',
  'settings.neverShareRecoveryPhrase': 'Nu partaja niciodată fraza ta de recuperare!',
  'settings.new': 'Nou',
  'settings.notAvailable': 'Nu este disponibil',
  'settings.notificationSoundDesc': 'Redă un sunet pentru mesaje noi',
  'settings.onlineStatus': 'Stare online',
  'settings.onlineStatusDesc': 'Permite contactelor tale să vadă starea ta online',
  'settings.peerLatency': 'Latența perechilor',
  'settings.peerQuality': 'Calitatea perechilor',
  'settings.peers': 'Perechi',
  'settings.readReceipts': 'Confirmări de citire',
  'settings.readReceiptsDesc': 'Informează ceilalți când le-ai citit mesajele',
  'settings.recoveryPhrase': 'Frază de recuperare',
  'settings.recoveryPhraseDesc': 'Fraza ta de recuperare de 24 de cuvinte poate fi folosită pentru a-ți recupera identitatea pe un alt dispozitiv. Păstreaz-o în siguranță și nu o partaja niciodată.',
  'settings.recoveryPhraseWarning': 'Oricine are aceste cuvinte poate accesa contul tău.',
  'settings.reducedMotion': 'Redu animațiile',
  'settings.reducedMotionDesc': 'Minimizează animațiile și tranzițiile',
  'settings.screenReaderOptimizations': 'Optimizări cititor de ecran',
  'settings.screenReaderOptimizationsDesc': 'Suport îmbunătățit pentru cititoarele de ecran',
  'settings.securitySubtitle': 'Gestionează identitatea și fraza de recuperare',
  'settings.sendOnEnter': 'Trimite cu Enter',
  'settings.sendOnEnterDesc': 'Apasă Enter pentru a trimite, Shift+Enter pentru linie nouă',
  'settings.showReadStatus': 'Afișează starea de citire',
  'settings.showReadStatusDesc': 'Afișează confirmări de citire pe mesajele trimise',
  'settings.showRecoveryPhrase': 'Afișează fraza de recuperare',
  'settings.showSeconds': 'Afișează secundele',
  'settings.showSecondsDesc': 'Include secundele în marcajele de timp',
  'settings.showTimestamps': 'Afișează marcajele de timp',
  'settings.showTimestampsDesc': 'Afișează ora lângă fiecare mesaj',
  'settings.showVideoControls': 'Afișează controalele video',
  'settings.showVideoControlsDesc': 'Afișează comenzile de redare pe videoclipuri',
  'settings.speaker': 'Difuzor',
  'settings.speakerUpdated': 'Difuzor actualizat',
  'settings.speakers': 'Difuzoare',
  'settings.stopTest': 'Oprește testul',
  'settings.storageSubtitle': 'Gestionează datele locale și descărcările',
  'settings.suspended': 'Suspendat',
  'settings.testCamera': 'Testează camera',
  'settings.testMic': 'Testează microfonul',
  'settings.textToSpeech': 'Text în vorbire',
  'settings.textToSpeechDesc': 'Citește mesajele cu voce tare',
  'settings.topics': 'Subiecte',
  'settings.tradeCryptocurrencyPrivately': 'Tranzacționează criptomonede în privat',
  'settings.typingIndicators': 'Indicatori de tastare',
  'settings.typingIndicatorsDesc': 'Permite celorlalți să vadă când tastezi',
  'settings.usedOf': 'utilizat din',
  'settings.videoQuality_auto': 'Automat',
  'settings.videoQuality_high': 'Înaltă',
  'settings.videoQuality_low': 'Joasă',
  'settings.videoQuality_medium': 'Medie',
  'settings.yourIdentity': 'Identitatea ta',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'ro') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (roTranslations[key]) {
    const newValue = roTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Romanian translations.`)
