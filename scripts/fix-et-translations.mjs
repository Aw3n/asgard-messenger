import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const etTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Laadi foto üles',
  'avatar.cropAvatar': 'Kärbi avatar',
  'avatar.cancel': 'Tühista',
  'avatar.cropSave': 'Kärbi ja salvesta',

  // ─── calls ───
  'calls.openChat': 'Vestlus',
  'calls.refreshServer': 'Värskenda serveriühendust',
  'calls.noContactsFound': 'Kontakte ei leitud',
  'calls.startCallHint': 'Alusta kõne kontaktide loetelust',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Laadi kontaktid Hyperbee salvestusest uuesti',
  'contacts.displayNameOptional': 'Kuvatav nimi (valikuline)',
  'contacts.displayNamePlaceholder': 'Kuidas nad peaksid ilmuma?',
  'contacts.selectContact': 'Valige kontakt üksikasjade vaatamiseks',
  'contacts.noBlockedContacts': 'Blokeeritud kontakte pole',
  'contacts.noContactsFound': 'Kontakte ei leitud',
  'contacts.error.publicKeyRequired': 'Sisestage avalik võti',
  'contacts.error.invalidPublicKey': 'Vale avaliku võtme vorming',
  'contacts.error.noIdentity': 'Identiteet pole saadaval',
  'contacts.error.noContactsFound': 'Kontakte ei leitud Hyperbee salvestusest',
  'contacts.error.failedToReload': 'Kontaktide uuesti laadimine ebaõnnestus',

  // ─── groups ───
  'groups.admins': 'Administraatorid',
  'groups.groups': 'Grupid',
  'groups.create': 'Loo',
  'groups.searchGroups': 'Otsi gruppe…',
  'groups.noGroupsFound': 'Gruppe ei leitud',
  'groups.noGroupsYet': 'Gruppe veel pole',
  'groups.createGroupHint': 'Loo grupp koostöö alustamiseks',
  'groups.createFirstGroup': 'Loo oma esimene grupp',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Tühista vastus',
  'messageInput.attachFile': 'Lisa fail',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Saada sõnum',
  'messageInput.dropFiles': 'Aseta failid siia',
  'messageInput.replyingTo': 'Vastamine',
  'messageInput.messageDeleted': 'Sõnum kustutatud',

  // ─── modal ───
  'modal.addContact': 'Lisa kontakt',
  'modal.publicKey': 'Avalik võti',
  'modal.publicKeyPlaceholder': 'Sisestage kontakti avalik võti…',
  'modal.displayName': 'Kuvatav nimi (valikuline)',
  'modal.displayNamePlaceholder': 'Andke sellele kontaktile nimi…',
  'modal.cancel': 'Tühista',
  'modal.add': 'Lisa',
  'modal.shareKey': 'Jagage oma avalikku võtit oma kontaktiga, et nemad saaksid teid samuti lisada. Leiate selle jaotisest Seaded → Profiil.',
  'modal.error.publicKeyRequired': 'Avalik võti on kohustuslik',
  'modal.error.publicKeyTooShort': 'Avalik võti on liiga lühike',
  'modal.error.contactExists': 'Kontakt on juba olemas',

  // ─── panels ───
  'panels.info': 'Teave',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimeeri',
  'titlebar.maximize': 'Maksimeeri',
  'titlebar.close': 'Sulge',

  // ─── toast ───
  'toast.dismiss': 'Sulge',
  'toast.dataImported': 'Andmed edukalt imporditud',
  'toast.importFailed': 'Importimine ebaõnnestus',
  'toast.invalidBackupFile': 'Vale varukoopiafail',
  'toast.cacheCleared': 'Vahemälu tühjendatud',
  'toast.failedToClearCache': 'Vahemälu tühjendamine ebaõnnestus',
  'toast.permissionGranted': 'Luba antud',
  'toast.permissionDenied': 'Luba keelatud',
  'toast.microphoneUpdated': 'Mikrofon uuendatud',
  'toast.cameraUpdated': 'Kaamera uuendatud',
  'toast.speakerUpdated': 'Kõlar uuendatud',
  'toast.cameraTestFailed': 'Kaamera test ebaõnnestus',
  'toast.addressCopied': 'Aadress kopeeritud lõikelauale',
  'toast.failedToCopyAddress': 'Aadressi kopeerimine ebaõnnestus',
  'toast.contactAdded': 'Kontakt lisatud — avastamine alustatud',
  'toast.failedToAddContact': 'Kontakti lisamine ebaõnnestus',

  // ─── settings ───
  'settings.audio': 'Heli',
  'settings.fileType_audio': 'Heli',
  'settings.profile': 'Profiil',
  'settings.appVersion': 'Versioon {{version}}',
  'settings.accessibilitySubtitle': 'Tehke Asgard endale kättesaadavamaks',
  'settings.atTheFollowingAddress': 'järgmisel aadressil:',
  'settings.audioQuality_high': 'Kõrge',
  'settings.audioQuality_low': 'Madal',
  'settings.audioQuality_medium': 'Keskmine',
  'settings.autoDownload': 'Automaatne allalaadimine',
  'settings.autoDownloadAudioDesc': 'Laadi helisõnumid automaatselt alla',
  'settings.autoDownloadImagesDesc': 'Laadi pildid automaatselt alla',
  'settings.autoDownloadVideosDesc': 'Laadi videod automaatselt alla',
  'settings.autoEmoji': 'Automaatsed emojid',
  'settings.autoEmojiDesc': 'Teisenda teksti otseteed nagu :) emojideks',
  'settings.autoPlayGifs': 'Esita GIFid automaatselt',
  'settings.autoPlayGifsDesc': 'Animeeri GIF-pildid automaatselt',
  'settings.autoPlayVideos': 'Esita videod automaatselt',
  'settings.autoPlayVideosDesc': 'Esita videod automaatselt, kui need on nähtavad',
  'settings.bandwidth': 'Ribalaius',
  'settings.batterySaver': 'Akusäästja',
  'settings.batterySaverDesc': 'Peata P2P, kui rakendus on taustal',
  'settings.builtWith': 'Ehitatud: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kaamera',
  'settings.cameraTestFailed': 'Kaamera test ebaõnnestus',
  'settings.cameraUpdated': 'Kaamera uuendatud',
  'settings.cameras': 'Kaamerad',
  'settings.chatDensity_comfortable': 'Mugav',
  'settings.chatDensity_compact': 'Kompaktne',
  'settings.chatDensity_cozy': 'Mugav',
  'settings.chatSubtitle': 'Seadistage oma vestluskogemus',
  'settings.clearCache': 'Tühjenda vahemälu',
  'settings.clickToCopy': 'Klõpsake kopeerimiseks',
  'settings.collapseMessages': 'Ahenda sõnumid',
  'settings.collapseMessagesDesc': 'Grupeeri järjestikused sõnumid samalt saatjalt',
  'settings.compressImages': 'Tihenda pilte',
  'settings.compressImagesDesc': 'Tihenda pildid enne saatmist',
  'settings.compressVideos': 'Tihenda videosid',
  'settings.compressVideosDesc': 'Tihenda videod enne saatmist andmekasutuse vähendamiseks',
  'settings.connected': 'Ühendatud',
  'settings.connecting': 'Ühendamine',
  'settings.connectionStatus': 'Ühenduse olek',
  'settings.copied': 'Kopeeritud!',
  'settings.copyToClipboard': 'Kopeeri lõikelauale',
  'settings.defaultAudioQuality': 'Vaikimisi helikvaliteet',
  'settings.defaultSpeaker': 'Vaikimisi kõlar',
  'settings.defaultVideoQuality': 'Vaikimisi videokvaliteet',
  'settings.detectedHardware': 'Tuvastatud riistvara',
  'settings.devicesAreAutoDetected': 'Seadmed tuvastatakse automaatselt. Muudatused rakendatakse reaalajas.',
  'settings.disconnected': 'Ühendus katkestatud',
  'settings.doNotDisturb': 'Mitte segada',
  'settings.doNotDisturbDesc': 'Keela kõik teated',
  'settings.doYouLikeAsgard': 'Kas teile meeldib Asgardi rakendus?',
  'settings.donationIn': 'Annetage',
  'settings.enableNotifications': 'Luba teated',
  'settings.enableNotificationsDesc': 'Kuva Windowsi teated uute sõnumite jaoks',
  'settings.enableRelay': 'Luba releed',
  'settings.enableRelayDesc': 'Kasuta pime-releesid, kui otsesed ühendused pole saadaval',
  'settings.exportData': 'Ekspordi andmed',
  'settings.flushDht': 'Tühjenda DHT',
  'settings.grantPermission': 'Anna luba',
  'settings.grantPermissionDesc': 'Andke luba seadmete nimede nägemiseks ja riistvara seadistamiseks.',
  'settings.hideRecoveryPhrase': 'Peida taastamisfraas',
  'settings.highContrast': 'Kõrge kontrast',
  'settings.highContrastDesc': 'Suurenda kontrasti parema nähtavuse jaoks',
  'settings.importData': 'Impordi andmed',
  'settings.inlinePreviews': 'Sisemised eelvaated',
  'settings.inlinePreviewsDesc': 'Kuva piltide eelvaated otse vestluses',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Klaviatuuriga navigeerimine',
  'settings.keyboardNavigationDesc': 'Kuva kiirklahvid ja fookuse näitajad',
  'settings.largerTouchTargets': 'Suuremad puutemärgid',
  'settings.largerTouchTargetsDesc': 'Tehke nupud ja interaktiivsed elemendid hõlpsamini puudutatavaks',
  'settings.linkPreviews': 'Lingi eelvaated',
  'settings.linkPreviewsDesc': 'Hangi ja kuva lingi eelvaated automaatselt (võib paljastada teie sirvimistegevuse)',
  'settings.localCache': 'Kohalik vahemälu',
  'settings.manageTrash': 'Halda prügikasti',
  'settings.maxPeers': 'Maksimaalne võrdsete arv',
  'settings.mbLimit': 'MB piirang',
  'settings.mediaSubtitle': 'Seadistage meedia esitus ja tihendamine',
  'settings.mentionsOnly': 'Ainult mainimised',
  'settings.mentionsOnlyDesc': 'Teavita ainult mainimiste ja otseste sõnumite korral',
  'settings.messageDensity': 'Sõnumite tihedus',
  'settings.messagePreview': 'Sõnumi eelvaade',
  'settings.messagePreviewDesc': 'Kuva sõnumi sisu teadetes',
  'settings.microphone': 'Mikrofon',
  'settings.microphoneAccess': 'Mikrofoni ja kaamera juurdepääs',
  'settings.microphoneUpdated': 'Mikrofon uuendatud',
  'settings.microphones': 'Mikrofonid',
  'settings.muteByDefault': 'Vaikimisi vaigistatud',
  'settings.muteByDefaultDesc': 'Käivita videod vaigistatud režiimis',
  'settings.networkSubtitle': 'P2P ühenduse seaded',
  'settings.neverShareRecoveryPhrase': 'Ärge jagage kunagi oma taastamisfraasi!',
  'settings.new': 'Uus',
  'settings.notAvailable': 'Pole saadaval',
  'settings.notificationSoundDesc': 'Esita heli uute sõnumite jaoks',
  'settings.onlineStatus': 'Veebi olek',
  'settings.onlineStatusDesc': 'Lubage oma kontaktidel näha teie veebi olekut',
  'settings.peerLatency': 'Võrdsete latentsus',
  'settings.peerQuality': 'Võrdsete kvaliteet',
  'settings.peers': 'Võrdsed',
  'settings.readReceipts': 'Lugemiskinnitused',
  'settings.readReceiptsDesc': 'Teavita teisi, kui olete nende sõnumid lugenud',
  'settings.recoveryPhrase': 'Taastamisfraas',
  'settings.recoveryPhraseDesc': 'Teie 24-sõnalist taastamisfraasi saab kasutada teie identiteedi taastamiseks teises seadmes. Hoidke seda turvaliselt ja ärge jagage seda kunagi.',
  'settings.recoveryPhraseWarning': 'Igaüks, kellel on need sõnad, pääseb teie kontole juurde.',
  'settings.reducedMotion': 'Vähenda animatsioone',
  'settings.reducedMotionDesc': 'Minimeeri animatsioonid ja üleminekud',
  'settings.screenReaderOptimizations': 'Ekraanilugeja optimeerimine',
  'settings.screenReaderOptimizationsDesc': 'Täiustatud tugi ekraanilugejatele',
  'settings.securitySubtitle': 'Hallake oma identiteeti ja taastamisfraasi',
  'settings.sendOnEnter': 'Saada Enteriga',
  'settings.sendOnEnterDesc': 'Vajutage Enter saatmiseks, Shift+Enter uue rea jaoks',
  'settings.showReadStatus': 'Kuva lugemise olek',
  'settings.showReadStatusDesc': 'Kuva lugemiskinnitused saadetud sõnumitel',
  'settings.showRecoveryPhrase': 'Kuva taastamisfraas',
  'settings.showSeconds': 'Kuva sekundid',
  'settings.showSecondsDesc': 'Kaasa sekundid ajatemplitesse',
  'settings.showTimestamps': 'Kuva ajatemplid',
  'settings.showTimestampsDesc': 'Kuva aeg iga sõnumi kõrval',
  'settings.showVideoControls': 'Kuva video juhtelemendid',
  'settings.showVideoControlsDesc': 'Kuva taasesituse juhtelemendid videotel',
  'settings.speaker': 'Kõlar',
  'settings.speakerUpdated': 'Kõlar uuendatud',
  'settings.speakers': 'Kõlarid',
  'settings.stopTest': 'Peata test',
  'settings.storageSubtitle': 'Hallake kohalikke andmeid ja allalaadimisi',
  'settings.suspended': 'Peatatud',
  'settings.testCamera': 'Testi kaamerat',
  'settings.testMic': 'Testi mikrofoni',
  'settings.textToSpeech': 'Tekst kõneks',
  'settings.textToSpeechDesc': 'Loe sõnumid valjusti ette',
  'settings.topics': 'Teemad',
  'settings.tradeCryptocurrencyPrivately': 'Kauple krüptovaluutaga privaatselt',
  'settings.typingIndicators': 'Kirjutamisnäitajad',
  'settings.typingIndicatorsDesc': 'Lubage teistel näha, kui kirjutate',
  'settings.usedOf': 'kasutatud',
  'settings.videoQuality_auto': 'Automaatne',
  'settings.videoQuality_high': 'Kõrge',
  'settings.videoQuality_low': 'Madal',
  'settings.videoQuality_medium': 'Keskmine',
  'settings.yourIdentity': 'Teie identiteet',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'et') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (etTranslations[key]) {
    const newValue = etTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Estonian translations.`)
