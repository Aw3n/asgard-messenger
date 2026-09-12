import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const fiTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Lataa kuva',
  'avatar.cropAvatar': 'Rajaa avatar',
  'avatar.cancel': 'Peruuta',
  'avatar.cropSave': 'Rajaa ja tallenna',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Päivitä palvelinyhteys',
  'calls.noContactsFound': 'Yhteystietoja ei löytynyt',
  'calls.startCallHint': 'Aloita puhelu yhteystietoluettelosta',

  // ─── common ───
  'common.admin': 'Ylläpitäjä',

  // ─── contacts ───
  'contacts.reloadContacts': 'Lataa yhteystiedot uudelleen Hyperbee-tallennuksesta',
  'contacts.displayNameOptional': 'Näyttönimi (valinnainen)',
  'contacts.displayNamePlaceholder': 'Miten heidän pitäisi näkyä?',
  'contacts.selectContact': 'Valitse yhteystieto nähdäksesi tiedot',
  'contacts.noBlockedContacts': 'Ei estettyjä yhteystietoja',
  'contacts.noContactsFound': 'Yhteystietoja ei löytynyt',
  'contacts.error.publicKeyRequired': 'Syötä julkinen avain',
  'contacts.error.invalidPublicKey': 'Virheellinen julkisen avaimen muoto',
  'contacts.error.noIdentity': 'Identiteettiä ei saatavilla',
  'contacts.error.noContactsFound': 'Yhteystietoja ei löytynyt Hyperbee-tallennuksesta',
  'contacts.error.failedToReload': 'Yhteystietojen uudelleenlataus epäonnistui',

  // ─── groups ───
  'groups.admins': 'Ylläpitäjät',
  'groups.groups': 'Ryhmät',
  'groups.create': 'Luo',
  'groups.searchGroups': 'Hae ryhmiä…',
  'groups.noGroupsFound': 'Ryhmiä ei löytynyt',
  'groups.noGroupsYet': 'Ei ryhmiä vielä',
  'groups.createGroupHint': 'Luo ryhmä aloittaaksesi yhteistyön',
  'groups.createFirstGroup': 'Luo ensimmäinen ryhmäsi',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Peruuta vastaus',
  'messageInput.attachFile': 'Liitä tiedosto',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Lähetä viesti',
  'messageInput.dropFiles': 'Pudota tiedostot tähän',
  'messageInput.replyingTo': 'Vastataan',
  'messageInput.messageDeleted': 'Viesti poistettu',

  // ─── modal ───
  'modal.addContact': 'Lisää yhteystieto',
  'modal.publicKey': 'Julkinen avain',
  'modal.publicKeyPlaceholder': 'Syötä yhteystiedon julkinen avain…',
  'modal.displayName': 'Näyttönimi (valinnainen)',
  'modal.displayNamePlaceholder': 'Anna tälle yhteystiedolle nimi…',
  'modal.cancel': 'Peruuta',
  'modal.add': 'Lisää',
  'modal.shareKey': 'Jaa julkinen avaimesi yhteystiedollesi, jotta he voivat lisätä sinut. Löydät sen kohdasta Asetukset → Profiili.',
  'modal.error.publicKeyRequired': 'Julkinen avain on pakollinen',
  'modal.error.publicKeyTooShort': 'Julkinen avain on liian lyhyt',
  'modal.error.contactExists': 'Yhteystieto on jo olemassa',

  // ─── panels ───
  'panels.info': 'Tiedot',

  // ─── titlebar ───
  'titlebar.minimize': 'Pienennä',
  'titlebar.maximize': 'Suurenna',
  'titlebar.close': 'Sulje',

  // ─── toast ───
  'toast.dismiss': 'Sulje',
  'toast.dataImported': 'Tiedot tuotu onnistuneesti',
  'toast.importFailed': 'Tuonti epäonnistui',
  'toast.invalidBackupFile': 'Virheellinen varmuuskopiotiedosto',
  'toast.cacheCleared': 'Välimuisti tyhjennetty',
  'toast.failedToClearCache': 'Välimuistin tyhjennys epäonnistui',
  'toast.permissionGranted': 'Lupa myönnetty',
  'toast.permissionDenied': 'Lupa evätty',
  'toast.microphoneUpdated': 'Mikrofoni päivitetty',
  'toast.cameraUpdated': 'Kamera päivitetty',
  'toast.speakerUpdated': 'Kaiutin päivitetty',
  'toast.cameraTestFailed': 'Kameratesti epäonnistui',
  'toast.addressCopied': 'Osoite kopioitu leikepöydälle',
  'toast.failedToCopyAddress': 'Osoitteen kopiointi epäonnistui',
  'toast.contactAdded': 'Yhteystieto lisätty — havainto aloitettu',
  'toast.failedToAddContact': 'Yhteystiedon lisääminen epäonnistui',

  // ─── settings ───
  'settings.audio': 'Ääni',
  'settings.fileType_audio': 'Ääni',
  'settings.profile': 'Profiili',
  'settings.appVersion': 'Versio {{version}}',
  'settings.accessibilitySubtitle': 'Tee Asgardista saavutettavampi sinulle',
  'settings.atTheFollowingAddress': 'seuraavassa osoitteessa:',
  'settings.audioQuality_high': 'Korkea',
  'settings.audioQuality_low': 'Matala',
  'settings.audioQuality_medium': 'Keskitaso',
  'settings.autoDownload': 'Automaattinen lataus',
  'settings.autoDownloadAudioDesc': 'Lataa ääniviestit automaattisesti',
  'settings.autoDownloadImagesDesc': 'Lataa kuvat automaattisesti',
  'settings.autoDownloadVideosDesc': 'Lataa videot automaattisesti',
  'settings.autoEmoji': 'Automaattiset emojit',
  'settings.autoEmojiDesc': 'Muunna tekstilyhenteet kuten :) emojeiksi',
  'settings.autoPlayGifs': 'Toista GIFit automaattisesti',
  'settings.autoPlayGifsDesc': 'Animoi GIF-kuvat automaattisesti',
  'settings.autoPlayVideos': 'Toista videot automaattisesti',
  'settings.autoPlayVideosDesc': 'Toista videot automaattisesti kun ne ovat näkyvissä',
  'settings.bandwidth': 'Kaistanleveys',
  'settings.batterySaver': 'Akunsäästö',
  'settings.batterySaverDesc': 'Keskeytä P2P kun sovellus on taustalla',
  'settings.builtWith': 'Rakennettu: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Kameratesti epäonnistui',
  'settings.cameraUpdated': 'Kamera päivitetty',
  'settings.cameras': 'Kamerat',
  'settings.chatDensity_comfortable': 'Mukava',
  'settings.chatDensity_compact': 'Tiivis',
  'settings.chatDensity_cozy': 'Mukava',
  'settings.chatSubtitle': 'Mukauta viestintäkokemustasi',
  'settings.clearCache': 'Tyhjennä välimuisti',
  'settings.clickToCopy': 'Napsauta kopioidaksesi',
  'settings.collapseMessages': 'Tiivistä viestit',
  'settings.collapseMessagesDesc': 'Ryhmitä peräkkäiset viestit samalta lähettäjältä',
  'settings.compressImages': 'Pakkaa kuvat',
  'settings.compressImagesDesc': 'Pakkaa kuvat ennen lähetystä',
  'settings.compressVideos': 'Pakkaa videot',
  'settings.compressVideosDesc': 'Pakkaa videot ennen lähetystä tietojenkäytön vähentämiseksi',
  'settings.connected': 'Yhdistetty',
  'settings.connecting': 'Yhdistetään',
  'settings.connectionStatus': 'Yhteyden tila',
  'settings.copied': 'Kopioitu!',
  'settings.copyToClipboard': 'Kopioi leikepöydälle',
  'settings.defaultAudioQuality': 'Oletusäänlaatu',
  'settings.defaultSpeaker': 'Oletuskaiutin',
  'settings.defaultVideoQuality': 'Oletusvideolaatu',
  'settings.detectedHardware': 'Havaittu laitteisto',
  'settings.devicesAreAutoDetected': 'Laitteet tunnistetaan automaattisesti. Muutokset otetaan käyttöön reaaliajassa.',
  'settings.disconnected': 'Katkaistu',
  'settings.doNotDisturb': 'Älä häiritse',
  'settings.doNotDisturbDesc': 'Estä kaikki ilmoitukset',
  'settings.doYouLikeAsgard': 'Pidätkö Asgard-sovelluksesta?',
  'settings.donationIn': 'Lahjoita',
  'settings.enableNotifications': 'Ota ilmoitukset käyttöön',
  'settings.enableNotificationsDesc': 'Näytä Windows-ilmoitukset uusista viesteistä',
  'settings.enableRelay': 'Ota välitys käyttöön',
  'settings.enableRelayDesc': 'Käytä sokkovälityspalvelimia kun suorat yhteydet eivät ole käytettävissä',
  'settings.exportData': 'Vie tiedot',
  'settings.flushDht': 'Tyhjennä DHT',
  'settings.grantPermission': 'Myönnä lupa',
  'settings.grantPermissionDesc': 'Myönnä lupa nähdäksesi laitteiden nimet ja määritä laitteistosi.',
  'settings.hideRecoveryPhrase': 'Piilota palautuslause',
  'settings.highContrast': 'Korkea kontrasti',
  'settings.highContrastDesc': 'Lisää kontrastia paremman näkyvyyden vuoksi',
  'settings.importData': 'Tuo tiedot',
  'settings.inlinePreviews': 'Sisäiset esikatselut',
  'settings.inlinePreviewsDesc': 'Näytä kuvien esikatselut suoraan chatissa',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Näppäimistönavigointi',
  'settings.keyboardNavigationDesc': 'Näytä pikanäppäimet ja fokuksen osoittimet',
  'settings.largerTouchTargets': 'Suuremmat kosketuskohteet',
  'settings.largerTouchTargetsDesc': 'Tee painikkeista ja interaktiivisista elementeistä helpommin kosketettavia',
  'settings.linkPreviews': 'Linkkien esikatselut',
  'settings.linkPreviewsDesc': 'Hae ja näytä linkkien esikatselut automaattisesti (voi paljastaa selaustoimintasi)',
  'settings.localCache': 'Paikallinen välimuisti',
  'settings.manageTrash': 'Hallinnoi roskakoria',
  'settings.maxPeers': 'Vertaisten enimmäismäärä',
  'settings.mbLimit': 'MB-raja',
  'settings.mediaSubtitle': 'Määritä median toisto ja pakkaus',
  'settings.mentionsOnly': 'Vain maininnat',
  'settings.mentionsOnlyDesc': 'Ilmoita vain maininnoista ja suorista viesteistä',
  'settings.messageDensity': 'Viestien tiheys',
  'settings.messagePreview': 'Viestin esikatselu',
  'settings.messagePreviewDesc': 'Näytä viestin sisältö ilmoituksissa',
  'settings.microphone': 'Mikrofoni',
  'settings.microphoneAccess': 'Mikrofonin ja kameran käyttöoikeus',
  'settings.microphoneUpdated': 'Mikrofoni päivitetty',
  'settings.microphones': 'Mikrofonit',
  'settings.muteByDefault': 'Mykistys oletuksena',
  'settings.muteByDefaultDesc': 'Aloita videot mykistettyinä',
  'settings.networkSubtitle': 'P2P-yhteysasetukset',
  'settings.neverShareRecoveryPhrase': 'Älä koskaan jaa palautuslausetta!',
  'settings.new': 'Uusi',
  'settings.notAvailable': 'Ei saatavilla',
  'settings.notificationSoundDesc': 'Toista ääni uusista viesteistä',
  'settings.onlineStatus': 'Online-tila',
  'settings.onlineStatusDesc': 'Anna yhteystietojesi nähdä online-tilasi',
  'settings.peerLatency': 'Vertaisten viive',
  'settings.peerQuality': 'Vertaisten laatu',
  'settings.peers': 'Vertaiset',
  'settings.readReceipts': 'Lukukuittaukset',
  'settings.readReceiptsDesc': 'Ilmoita muille, kun olet lukenut heidän viestinsä',
  'settings.recoveryPhrase': 'Palautuslause',
  'settings.recoveryPhraseDesc': '24 sanan palautuslausetta voidaan käyttää identiteettisi palauttamiseen toisella laitteella. Pidä se turvassa äläkä koskaan jaa sitä.',
  'settings.recoveryPhraseWarning': 'Kenellä tahansa näillä sanoilla voi olla pääsy tilillesi.',
  'settings.reducedMotion': 'Vähennä liikettä',
  'settings.reducedMotionDesc': 'Minimoi animaatiot ja siirtymät',
  'settings.screenReaderOptimizations': 'Näytönlukijan optimoinnit',
  'settings.screenReaderOptimizationsDesc': 'Parannettu tuki näytönlukijoille',
  'settings.securitySubtitle': 'Hallinnoi identiteettiäsi ja palautuslausetta',
  'settings.sendOnEnter': 'Lähetä Enterillä',
  'settings.sendOnEnterDesc': 'Paina Enter lähettääksesi, Shift+Enter uudelle riville',
  'settings.showReadStatus': 'Näytä lukutila',
  'settings.showReadStatusDesc': 'Näytä lukukuittaukset lähetetyissä viesteissä',
  'settings.showRecoveryPhrase': 'Näytä palautuslause',
  'settings.showSeconds': 'Näytä sekunnit',
  'settings.showSecondsDesc': 'Sisällytä sekunnit aikaleimoihin',
  'settings.showTimestamps': 'Näytä aikaleimat',
  'settings.showTimestampsDesc': 'Näytä aika jokaisen viestin vieressä',
  'settings.showVideoControls': 'Näytä videon ohjaimet',
  'settings.showVideoControlsDesc': 'Näytä toiston ohjaimet videoissa',
  'settings.speaker': 'Kaiutin',
  'settings.speakerUpdated': 'Kaiutin päivitetty',
  'settings.speakers': 'Kaiuttimet',
  'settings.stopTest': 'Pysäytä testi',
  'settings.storageSubtitle': 'Hallinnoi paikallisia tietoja ja latauksia',
  'settings.suspended': 'Keskeytetty',
  'settings.testCamera': 'Testaa kamera',
  'settings.testMic': 'Testaa mikrofoni',
  'settings.textToSpeech': 'Teksti puheeksi',
  'settings.textToSpeechDesc': 'Lue viestit ääneen',
  'settings.topics': 'Aiheet',
  'settings.tradeCryptocurrencyPrivately': 'Käy kauppaa kryptovaluutoilla yksityisesti',
  'settings.typingIndicators': 'Kirjoitusilmaisimet',
  'settings.typingIndicatorsDesc': 'Anna muiden nähdä, kun kirjoitat',
  'settings.usedOf': 'käytetty',
  'settings.videoQuality_auto': 'Automaattinen',
  'settings.videoQuality_high': 'Korkea',
  'settings.videoQuality_low': 'Matala',
  'settings.videoQuality_medium': 'Keskitaso',
  'settings.yourIdentity': 'Identiteettisi',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'fi') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (fiTranslations[key]) {
    const newValue = fiTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Finnish translations.`)
