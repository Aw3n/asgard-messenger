import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const huTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Fénykép feltöltése',
  'avatar.cropAvatar': 'Avatar vágása',
  'avatar.cancel': 'Mégse',
  'avatar.cropSave': 'Vágás és mentés',

  // ─── calls ───
  'calls.openChat': 'Csevegés',
  'calls.refreshServer': 'Szerverkapcsolat frissítése',
  'calls.noContactsFound': 'Nem találhatók névjegyek',
  'calls.startCallHint': 'Indítson hívást a névjegyzékből',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Névjegyek újratöltése Hyperbee tárolóból',
  'contacts.displayNameOptional': 'Megjelenítendő név (opcionális)',
  'contacts.displayNamePlaceholder': 'Hogyan jelenjenek meg?',
  'contacts.selectContact': 'Válasszon ki egy névjegyet a részletek megtekintéséhez',
  'contacts.noBlockedContacts': 'Nincsenek blokkolt névjegyek',
  'contacts.noContactsFound': 'Nem találhatók névjegyek',
  'contacts.error.publicKeyRequired': 'Adjon meg egy nyilvános kulcsot',
  'contacts.error.invalidPublicKey': 'Érvénytelen nyilvános kulcs formátum',
  'contacts.error.noIdentity': 'Nem érhető el identitás',
  'contacts.error.noContactsFound': 'Nem találhatók névjegyek a Hyperbee tárolóban',
  'contacts.error.failedToReload': 'Nem sikerült újratölteni a névjegyeket',

  // ─── groups ───
  'groups.admins': 'Adminisztrátorok',
  'groups.groups': 'Csoportok',
  'groups.create': 'Létrehozás',
  'groups.searchGroups': 'Csoportok keresése…',
  'groups.noGroupsFound': 'Nem találhatók csoportok',
  'groups.noGroupsYet': 'Még nincsenek csoportok',
  'groups.createGroupHint': 'Hozzon létre egy csoportot az együttműködés megkezdéséhez',
  'groups.createFirstGroup': 'Hozza létre első csoportját',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Válasz megszakítása',
  'messageInput.attachFile': 'Fájl csatolása',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Üzenet küldése',
  'messageInput.dropFiles': 'Húzza ide a fájlokat',
  'messageInput.replyingTo': 'Válasz neki',
  'messageInput.messageDeleted': 'Üzenet törölve',

  // ─── modal ───
  'modal.addContact': 'Névjegy hozzáadása',
  'modal.publicKey': 'Nyilvános kulcs',
  'modal.publicKeyPlaceholder': 'Adja meg a névjegy nyilvános kulcsát…',
  'modal.displayName': 'Megjelenítendő név (opcionális)',
  'modal.displayNamePlaceholder': 'Adjon nevet ennek a névjegynek…',
  'modal.cancel': 'Mégse',
  'modal.add': 'Hozzáadás',
  'modal.shareKey': 'Ossza meg nyilvános kulcsát névjegyével, hogy ő is hozzáadhassa Önt. A Beállítások → Profil alatt találja.',
  'modal.error.publicKeyRequired': 'A nyilvános kulcs kötelező',
  'modal.error.publicKeyTooShort': 'A nyilvános kulcs túl rövid',
  'modal.error.contactExists': 'A névjegy már létezik',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Kis méret',
  'titlebar.maximize': 'Teljes méret',
  'titlebar.close': 'Bezárás',

  // ─── toast ───
  'toast.dismiss': 'Bezárás',
  'toast.dataImported': 'Adatok sikeresen importálva',
  'toast.importFailed': 'Importálás sikertelen',
  'toast.invalidBackupFile': 'Érvénytelen biztonsági mentés fájl',
  'toast.cacheCleared': 'Gyorsítótár törölve',
  'toast.failedToClearCache': 'Gyorsítótár törlése sikertelen',
  'toast.permissionGranted': 'Engedély megadva',
  'toast.permissionDenied': 'Engedély megtagadva',
  'toast.microphoneUpdated': 'Mikrofon frissítve',
  'toast.cameraUpdated': 'Kamera frissítve',
  'toast.speakerUpdated': 'Hangszóró frissítve',
  'toast.cameraTestFailed': 'Kamerateszt sikertelen',
  'toast.addressCopied': 'Cím vágólapra másolva',
  'toast.failedToCopyAddress': 'Cím másolása sikertelen',
  'toast.contactAdded': 'Névjegy hozzáadva — felderítés elindítva',
  'toast.failedToAddContact': 'Névjegy hozzáadása sikertelen',

  // ─── settings ───
  'settings.audio': 'Hang',
  'settings.fileType_audio': 'Hang',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Verzió {{version}}',
  'settings.accessibilitySubtitle': 'Tegye az Asgardot hozzáférhetőbbé az Ön számára',
  'settings.atTheFollowingAddress': 'a következő címen:',
  'settings.audioQuality_high': 'Magas',
  'settings.audioQuality_low': 'Alacsony',
  'settings.audioQuality_medium': 'Közepes',
  'settings.autoDownload': 'Automatikus letöltés',
  'settings.autoDownloadAudioDesc': 'Hangüzenetek automatikus letöltése',
  'settings.autoDownloadImagesDesc': 'Képek automatikus letöltése',
  'settings.autoDownloadVideosDesc': 'Videók automatikus letöltése',
  'settings.autoEmoji': 'Automatikus emoji',
  'settings.autoEmojiDesc': 'Szöveges parancsikonok konvertálása emojivá, mint pl. :)',
  'settings.autoPlayGifs': 'GIF-ek automatikus lejátszása',
  'settings.autoPlayGifsDesc': 'GIF képek automatikus animálása',
  'settings.autoPlayVideos': 'Videók automatikus lejátszása',
  'settings.autoPlayVideosDesc': 'Videók automatikus lejátszása, amikor láthatók',
  'settings.bandwidth': 'Sávszélesség',
  'settings.batterySaver': 'Akkumulátorkímélő',
  'settings.batterySaverDesc': 'P2P felfüggesztése, amikor az alkalmazás a háttérben van',
  'settings.builtWith': 'Készült: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Kamerateszt sikertelen',
  'settings.cameraUpdated': 'Kamera frissítve',
  'settings.cameras': 'Kamerák',
  'settings.chatDensity_comfortable': 'Kényelmes',
  'settings.chatDensity_compact': 'Kompakt',
  'settings.chatDensity_cozy': 'Kényelmes',
  'settings.chatSubtitle': 'Állítsa be csevegési élményét',
  'settings.clearCache': 'Gyorsítótár törlése',
  'settings.clickToCopy': 'Kattintson a másoláshoz',
  'settings.collapseMessages': 'Üzenetek összecsukása',
  'settings.collapseMessagesDesc': 'Egyazon feladó egymást követő üzeneteinek csoportosítása',
  'settings.compressImages': 'Képek tömörítése',
  'settings.compressImagesDesc': 'Képek tömörítése küldés előtt',
  'settings.compressVideos': 'Videók tömörítése',
  'settings.compressVideosDesc': 'Videók tömörítése küldés előtt az adatfelhasználás csökkentése érdekében',
  'settings.connected': 'Csatlakozva',
  'settings.connecting': 'Csatlakozás',
  'settings.connectionStatus': 'Kapcsolat állapota',
  'settings.copied': 'Másolva!',
  'settings.copyToClipboard': 'Másolás a vágólapra',
  'settings.defaultAudioQuality': 'Alapértelmezett hangminőség',
  'settings.defaultSpeaker': 'Alapértelmezett hangszóró',
  'settings.defaultVideoQuality': 'Alapértelmezett videóminőség',
  'settings.detectedHardware': 'Észlelt hardver',
  'settings.devicesAreAutoDetected': 'Az eszközök automatikusan felismerhetők. A módosítások valós időben lépnek életbe.',
  'settings.disconnected': 'Leválasztva',
  'settings.doNotDisturb': 'Ne zavarjanak',
  'settings.doNotDisturbDesc': 'Összes értesítés elnyomása',
  'settings.doYouLikeAsgard': 'Tetszik az Asgard alkalmazás?',
  'settings.donationIn': 'Adományozás',
  'settings.enableNotifications': 'Értesítések engedélyezése',
  'settings.enableNotificationsDesc': 'Windows értesítések megjelenítése új üzenetekhez',
  'settings.enableRelay': 'Relé engedélyezése',
  'settings.enableRelayDesc': 'Vak relék használata, ha a közvetlen kapcsolatok nem elérhetők',
  'settings.exportData': 'Adatok exportálása',
  'settings.flushDht': 'DHT ürítése',
  'settings.grantPermission': 'Engedély megadása',
  'settings.grantPermissionDesc': 'Adjon engedélyt az eszköznevek megtekintéséhez és a hardver beállításához.',
  'settings.hideRecoveryPhrase': 'Helyreállítási kifejezés elrejtése',
  'settings.highContrast': 'Magas kontraszt',
  'settings.highContrastDesc': 'Kontraszt növelése a jobb láthatóság érdekében',
  'settings.importData': 'Adatok importálása',
  'settings.inlinePreviews': 'Beágyazott előnézetek',
  'settings.inlinePreviewsDesc': 'Képek előnézetének megjelenítése közvetlenül a csevegésben',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Billentyűzet navigáció',
  'settings.keyboardNavigationDesc': 'Gyorsbillentyűk és fókuszjelzők megjelenítése',
  'settings.largerTouchTargets': 'Nagyobb érintési célok',
  'settings.largerTouchTargetsDesc': 'A gombok és interaktív elemek könnyebben érinthetők',
  'settings.linkPreviews': 'Link előnézetek',
  'settings.linkPreviewsDesc': 'Link előnézetek automatikus lekérése és megjelenítése (felfedheti böngészési tevékenységét)',
  'settings.localCache': 'Helyi gyorsítótár',
  'settings.manageTrash': 'Kuka kezelése',
  'settings.maxPeers': 'Maximális partnerek száma',
  'settings.mbLimit': 'MB korlát',
  'settings.mediaSubtitle': 'Médialejátszás és tömörítés beállítása',
  'settings.mentionsOnly': 'Csak említések',
  'settings.mentionsOnlyDesc': 'Értesítés csak említések és közvetlen üzenetek esetén',
  'settings.messageDensity': 'Üzenet sűrűség',
  'settings.messagePreview': 'Üzenet előnézet',
  'settings.messagePreviewDesc': 'Üzenet tartalmának megjelenítése az értesítésekben',
  'settings.microphone': 'Mikrofon',
  'settings.microphoneAccess': 'Mikrofon és kamera hozzáférés',
  'settings.microphoneUpdated': 'Mikrofon frissítve',
  'settings.microphones': 'Mikrofonok',
  'settings.muteByDefault': 'Alapértelmezetten némítva',
  'settings.muteByDefaultDesc': 'Videók indítása néma módban',
  'settings.networkSubtitle': 'P2P kapcsolati beállítások',
  'settings.neverShareRecoveryPhrase': 'Soha ne ossza meg a helyreállítási kifejezését!',
  'settings.new': 'Új',
  'settings.notAvailable': 'Nem elérhető',
  'settings.notificationSoundDesc': 'Hang lejátszása új üzenetekhez',
  'settings.onlineStatus': 'Online állapot',
  'settings.onlineStatusDesc': 'Engedélyezze névjegyeinek, hogy lássák online állapotát',
  'settings.peerLatency': 'Partner késleltetés',
  'settings.peerQuality': 'Partner minőség',
  'settings.peers': 'Partnerek',
  'settings.readReceipts': 'Olvasási visszaigazolások',
  'settings.readReceiptsDesc': 'Értesítse a többieket, amikor elolvasta üzeneteiket',
  'settings.recoveryPhrase': 'Helyreállítási kifejezés',
  'settings.recoveryPhraseDesc': '24 szavas helyreállítási kifejezése használható identitása egy másik eszközön történő helyreállításához. Tartsa biztonságban és soha ne ossza meg.',
  'settings.recoveryPhraseWarning': 'Bárki, aki birtokolja ezeket a szavakat, hozzáférhet fiókjához.',
  'settings.reducedMotion': 'Animációk csökkentése',
  'settings.reducedMotionDesc': 'Animációk és átmenetek minimalizálása',
  'settings.screenReaderOptimizations': 'Képernyőolvasó optimalizálások',
  'settings.screenReaderOptimizationsDesc': 'Továbbfejlesztett képernyőolvasó támogatás',
  'settings.securitySubtitle': 'Identitása és helyreállítási kifejezése kezelése',
  'settings.sendOnEnter': 'Küldés Enterrel',
  'settings.sendOnEnterDesc': 'Nyomja meg az Entert a küldéshez, Shift+Enter új sorhoz',
  'settings.showReadStatus': 'Olvasási állapot megjelenítése',
  'settings.showReadStatusDesc': 'Olvasási visszaigazolások megjelenítése az elküldött üzeneteken',
  'settings.showRecoveryPhrase': 'Helyreállítási kifejezés megjelenítése',
  'settings.showSeconds': 'Másodpercek megjelenítése',
  'settings.showSecondsDesc': 'Másodpercek beillesztése az időbélyegekbe',
  'settings.showTimestamps': 'Időbélyegek megjelenítése',
  'settings.showTimestampsDesc': 'Idő megjelenítése minden üzenet mellett',
  'settings.showVideoControls': 'Vezérlők megjelenítése',
  'settings.showVideoControlsDesc': 'Lejátszási vezérlők megjelenítése a videókon',
  'settings.speaker': 'Hangszóró',
  'settings.speakerUpdated': 'Hangszóró frissítve',
  'settings.speakers': 'Hangszórók',
  'settings.stopTest': 'Teszt leállítása',
  'settings.storageSubtitle': 'Helyi adatok és letöltések kezelése',
  'settings.suspended': 'Felfüggesztve',
  'settings.testCamera': 'Kamera tesztelése',
  'settings.testMic': 'Mikrofon tesztelése',
  'settings.textToSpeech': 'Szövegfelolvasás',
  'settings.textToSpeechDesc': 'Üzenetek felolvasása hangosan',
  'settings.topics': 'Témák',
  'settings.tradeCryptocurrencyPrivately': 'Kereskedjen kriptovalutával privátban',
  'settings.typingIndicators': 'Gépelési jelzők',
  'settings.typingIndicatorsDesc': 'Engedélyezze másoknak, hogy lássák, amikor gépel',
  'settings.usedOf': 'használt',
  'settings.videoQuality_auto': 'Automatikus',
  'settings.videoQuality_high': 'Magas',
  'settings.videoQuality_low': 'Alacsony',
  'settings.videoQuality_medium': 'Közepes',
  'settings.yourIdentity': 'Az Ön identitása',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'hu') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (huTranslations[key]) {
    const newValue = huTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Hungarian translations.`)
