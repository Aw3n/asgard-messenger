import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const plTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Prześlij zdjęcie',
  'avatar.cropAvatar': 'Przytnij awatar',
  'avatar.cancel': 'Anuluj',
  'avatar.cropSave': 'Przytnij i zapisz',

  // ─── calls ───
  'calls.openChat': 'Czat',
  'calls.refreshServer': 'Odśwież połączenie z serwerem',
  'calls.noContactsFound': 'Nie znaleziono kontaktów',
  'calls.startCallHint': 'Rozpocznij połączenie z listy kontaktów',

  // ─── common ───
  'common.admin': 'Administrator',

  // ─── contacts ───
  'contacts.reloadContacts': 'Załaduj ponownie kontakty z magazynu Hyperbee',
  'contacts.displayNameOptional': 'Nazwa wyświetlana (opcjonalna)',
  'contacts.displayNamePlaceholder': 'Jak powinny się wyświetlać?',
  'contacts.selectContact': 'Wybierz kontakt, aby zobaczyć szczegóły',
  'contacts.noBlockedContacts': 'Brak zablokowanych kontaktów',
  'contacts.noContactsFound': 'Nie znaleziono kontaktów',
  'contacts.error.publicKeyRequired': 'Wprowadź klucz publiczny',
  'contacts.error.invalidPublicKey': 'Nieprawidłowy format klucza publicznego',
  'contacts.error.noIdentity': 'Brak dostępnej tożsamości',
  'contacts.error.noContactsFound': 'Nie znaleziono kontaktów w magazynie Hyperbee',
  'contacts.error.failedToReload': 'Nie udało się ponownie załadować kontaktów',

  // ─── groups ───
  'groups.admins': 'Administratorzy',
  'groups.groups': 'Grupy',
  'groups.create': 'Utwórz',
  'groups.searchGroups': 'Szukaj grup…',
  'groups.noGroupsFound': 'Nie znaleziono grup',
  'groups.noGroupsYet': 'Brak grup',
  'groups.createGroupHint': 'Utwórz grupę, aby rozpocząć współpracę',
  'groups.createFirstGroup': 'Utwórz swoją pierwszą grupę',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Anuluj odpowiedź',
  'messageInput.attachFile': 'Dołącz plik',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Wyślij wiadomość',
  'messageInput.dropFiles': 'Upuść pliki tutaj',
  'messageInput.replyingTo': 'Odpowiadanie do',
  'messageInput.messageDeleted': 'Wiadomość usunięta',

  // ─── modal ───
  'modal.addContact': 'Dodaj kontakt',
  'modal.publicKey': 'Klucz publiczny',
  'modal.publicKeyPlaceholder': 'Wprowadź klucz publiczny kontaktu…',
  'modal.displayName': 'Nazwa wyświetlana (opcjonalna)',
  'modal.displayNamePlaceholder': 'Nadaj temu kontaktowi nazwę…',
  'modal.cancel': 'Anuluj',
  'modal.add': 'Dodaj',
  'modal.shareKey': 'Udostępnij swój klucz publiczny kontaktowi, aby również mógł Cię dodać. Znajdziesz go w Ustawienia → Profil.',
  'modal.error.publicKeyRequired': 'Klucz publiczny jest wymagany',
  'modal.error.publicKeyTooShort': 'Klucz publiczny jest za krótki',
  'modal.error.contactExists': 'Kontakt już istnieje',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimalizuj',
  'titlebar.maximize': 'Maksymalizuj',
  'titlebar.close': 'Zamknij',

  // ─── toast ───
  'toast.dismiss': 'Zamknij',
  'toast.dataImported': 'Dane zaimportowane pomyślnie',
  'toast.importFailed': 'Importowanie nie powiodło się',
  'toast.invalidBackupFile': 'Nieprawidłowy plik kopii zapasowej',
  'toast.cacheCleared': 'Pamięć podręczna wyczyszczona',
  'toast.failedToClearCache': 'Nie udało się wyczyścić pamięci podręcznej',
  'toast.permissionGranted': 'Uprawnienie przyznane',
  'toast.permissionDenied': 'Uprawnienie odrzucone',
  'toast.microphoneUpdated': 'Mikrofon zaktualizowany',
  'toast.cameraUpdated': 'Kamera zaktualizowana',
  'toast.speakerUpdated': 'Głośnik zaktualizowany',
  'toast.cameraTestFailed': 'Test kamery nie powiódł się',
  'toast.addressCopied': 'Adres skopiowany do schowka',
  'toast.failedToCopyAddress': 'Nie udało się skopiować adresu',
  'toast.contactAdded': 'Kontakt dodany — wykrywanie rozpoczęte',
  'toast.failedToAddContact': 'Nie udało się dodać kontaktu',

  // ─── settings ───
  'settings.audio': 'Audio',
  'settings.fileType_audio': 'Audio',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Wersja {{version}}',
  'settings.accessibilitySubtitle': 'Uczyń Asgard bardziej dostępnym dla Ciebie',
  'settings.atTheFollowingAddress': 'pod następującym adresem:',
  'settings.audioQuality_high': 'Wysoka',
  'settings.audioQuality_low': 'Niska',
  'settings.audioQuality_medium': 'Średnia',
  'settings.autoDownload': 'Automatyczne pobieranie',
  'settings.autoDownloadAudioDesc': 'Automatycznie pobieraj wiadomości audio',
  'settings.autoDownloadImagesDesc': 'Automatycznie pobieraj obrazy',
  'settings.autoDownloadVideosDesc': 'Automatycznie pobieraj filmy',
  'settings.autoEmoji': 'Automatyczne emoji',
  'settings.autoEmojiDesc': 'Konwertuj skróty tekstowe jak :) na emoji',
  'settings.autoPlayGifs': 'Automatycznie odtwarzaj GIFy',
  'settings.autoPlayGifsDesc': 'Automatycznie animuj obrazy GIF',
  'settings.autoPlayVideos': 'Automatycznie odtwarzaj filmy',
  'settings.autoPlayVideosDesc': 'Automatycznie odtwarzaj filmy, gdy są widoczne',
  'settings.bandwidth': 'Przepustowość',
  'settings.batterySaver': 'Oszczędzanie baterii',
  'settings.batterySaverDesc': 'Wstrzymaj P2P, gdy aplikacja jest w tle',
  'settings.builtWith': 'Zbudowano z: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Test kamery nie powiódł się',
  'settings.cameraUpdated': 'Kamera zaktualizowana',
  'settings.cameras': 'Kamery',
  'settings.chatDensity_comfortable': 'Wygodna',
  'settings.chatDensity_compact': 'Kompaktowa',
  'settings.chatDensity_cozy': 'Wygodna',
  'settings.chatSubtitle': 'Skonfiguruj swoje doświadczenie czatu',
  'settings.clearCache': 'Wyczyść pamięć podręczną',
  'settings.clickToCopy': 'Kliknij, aby skopiować',
  'settings.collapseMessages': 'Zwiń wiadomości',
  'settings.collapseMessagesDesc': 'Grupuj kolejne wiadomości od tego samego nadawcy',
  'settings.compressImages': 'Kompresuj obrazy',
  'settings.compressImagesDesc': 'Kompresuj obrazy przed wysłaniem',
  'settings.compressVideos': 'Kompresuj filmy',
  'settings.compressVideosDesc': 'Kompresuj filmy przed wysłaniem, aby zmniejszyć zużycie danych',
  'settings.connected': 'Połączono',
  'settings.connecting': 'Łączenie',
  'settings.connectionStatus': 'Stan połączenia',
  'settings.copied': 'Skopiowano!',
  'settings.copyToClipboard': 'Kopiuj do schowka',
  'settings.defaultAudioQuality': 'Domyślna jakość audio',
  'settings.defaultSpeaker': 'Domyślny głośnik',
  'settings.defaultVideoQuality': 'Domyślna jakość wideo',
  'settings.detectedHardware': 'Wykryty sprzęt',
  'settings.devicesAreAutoDetected': 'Urządzenia są wykrywane automatycznie. Zmiany są stosowane w czasie rzeczywistym.',
  'settings.disconnected': 'Rozłączono',
  'settings.doNotDisturb': 'Nie przeszkadzać',
  'settings.doNotDisturbDesc': 'Wstrzymaj wszystkie powiadomienia',
  'settings.doYouLikeAsgard': 'Podoba Ci się aplikacja Asgard?',
  'settings.donationIn': 'Przekaż darowiznę',
  'settings.enableNotifications': 'Włącz powiadomienia',
  'settings.enableNotificationsDesc': 'Pokaż powiadomienia Windows dla nowych wiadomości',
  'settings.enableRelay': 'Włącz przekaźnik',
  'settings.enableRelayDesc': 'Używaj ślepych przekaźników, gdy bezpośrednie połączenia nie są dostępne',
  'settings.exportData': 'Eksportuj dane',
  'settings.flushDht': 'Opróżnij DHT',
  'settings.grantPermission': 'Przyznaj uprawnienie',
  'settings.grantPermissionDesc': 'Przyznaj uprawnienie, aby zobaczyć nazwy urządzeń i skonfigurować sprzęt.',
  'settings.hideRecoveryPhrase': 'Ukryj frazę odzyskiwania',
  'settings.highContrast': 'Wysoki kontrast',
  'settings.highContrastDesc': 'Zwiększ kontrast dla lepszej widoczności',
  'settings.importData': 'Importuj dane',
  'settings.inlinePreviews': 'Wbudowane podglądy',
  'settings.inlinePreviewsDesc': 'Pokazuj podglądy obrazów bezpośrednio na czacie',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Nawigacja klawiaturą',
  'settings.keyboardNavigationDesc': 'Pokazuj skróty klawiaturowe i wskaźniki fokusu',
  'settings.largerTouchTargets': 'Większe cele dotykowe',
  'settings.largerTouchTargetsDesc': 'Spraw, aby przyciski i elementy interaktywne były łatwiejsze do dotknięcia',
  'settings.linkPreviews': 'Podglądy linków',
  'settings.linkPreviewsDesc': 'Automatycznie pobieraj i pokazuj podglądy linków (może ujawnić Twoją aktywność przeglądania)',
  'settings.localCache': 'Lokalna pamięć podręczna',
  'settings.manageTrash': 'Zarządzaj koszem',
  'settings.maxPeers': 'Maksymalna liczba peerów',
  'settings.mbLimit': 'Limit MB',
  'settings.mediaSubtitle': 'Skonfiguruj odtwarzanie i kompresję mediów',
  'settings.mentionsOnly': 'Tylko wzmianki',
  'settings.mentionsOnlyDesc': 'Powiadamiaj tylko o wzmiankach i bezpośrednich wiadomościach',
  'settings.messageDensity': 'Gęstość wiadomości',
  'settings.messagePreview': 'Podgląd wiadomości',
  'settings.messagePreviewDesc': 'Pokazuj treść wiadomości w powiadomieniach',
  'settings.microphone': 'Mikrofon',
  'settings.microphoneAccess': 'Dostęp do mikrofonu i kamery',
  'settings.microphoneUpdated': 'Mikrofon zaktualizowany',
  'settings.microphones': 'Mikrofony',
  'settings.muteByDefault': 'Domyślnie wyciszony',
  'settings.muteByDefaultDesc': 'Uruchamiaj filmy w trybie wyciszonym',
  'settings.networkSubtitle': 'Ustawienia połączenia P2P',
  'settings.neverShareRecoveryPhrase': 'Nigdy nie udostępniaj swojej frazy odzyskiwania!',
  'settings.new': 'Nowy',
  'settings.notAvailable': 'Niedostępne',
  'settings.notificationSoundDesc': 'Odtwarzaj dźwięk dla nowych wiadomości',
  'settings.onlineStatus': 'Status online',
  'settings.onlineStatusDesc': 'Pozwól swoim kontaktom zobaczyć Twój status online',
  'settings.peerLatency': 'Opóźnienie peerów',
  'settings.peerQuality': 'Jakość peerów',
  'settings.peers': 'Peery',
  'settings.readReceipts': 'Potwierdzenia odczytu',
  'settings.readReceiptsDesc': 'Powiadamiaj innych, gdy przeczytasz ich wiadomości',
  'settings.recoveryPhrase': 'Fraza odzyskiwania',
  'settings.recoveryPhraseDesc': 'Twoja fraza odzyskiwania składająca się z 24 słów może być użyta do przywrócenia Twojej tożsamości na innym urządzeniu. Przechowuj ją bezpiecznie i nigdy jej nie udostępniaj.',
  'settings.recoveryPhraseWarning': 'Każdy, kto zna te słowa, może uzyskać dostęp do Twojego konta.',
  'settings.reducedMotion': 'Zmniejsz animacje',
  'settings.reducedMotionDesc': 'Minimalizuj animacje i przejścia',
  'settings.screenReaderOptimizations': 'Optymalizacje czytnika ekranu',
  'settings.screenReaderOptimizationsDesc': 'Ulepszona obsługa czytników ekranu',
  'settings.securitySubtitle': 'Zarządzaj swoją tożsamością i frazą odzyskiwania',
  'settings.sendOnEnter': 'Wyślij klawiszem Enter',
  'settings.sendOnEnterDesc': 'Naciśnij Enter, aby wysłać, Shift+Enter dla nowej linii',
  'settings.showReadStatus': 'Pokaż status odczytu',
  'settings.showReadStatusDesc': 'Pokazuj potwierdzenia odczytu na wysłanych wiadomościach',
  'settings.showRecoveryPhrase': 'Pokaż frazę odzyskiwania',
  'settings.showSeconds': 'Pokaż sekundy',
  'settings.showSecondsDesc': 'Dołącz sekundy do znaczników czasu',
  'settings.showTimestamps': 'Pokaż znaczniki czasu',
  'settings.showTimestampsDesc': 'Pokazuj czas obok każdej wiadomości',
  'settings.showVideoControls': 'Pokaż elementy sterujące wideo',
  'settings.showVideoControlsDesc': 'Pokazuj elementy sterujące odtwarzaniem na filmach',
  'settings.speaker': 'Głośnik',
  'settings.speakerUpdated': 'Głośnik zaktualizowany',
  'settings.speakers': 'Głośniki',
  'settings.stopTest': 'Zatrzymaj test',
  'settings.storageSubtitle': 'Zarządzaj lokalnymi danymi i pobraniami',
  'settings.suspended': 'Wstrzymano',
  'settings.testCamera': 'Testuj kamerę',
  'settings.testMic': 'Testuj mikrofon',
  'settings.textToSpeech': 'Tekst na mowę',
  'settings.textToSpeechDesc': 'Czytaj wiadomości na głos',
  'settings.topics': 'Tematy',
  'settings.tradeCryptocurrencyPrivately': 'Handluj kryptowalutami prywatnie',
  'settings.typingIndicators': 'Wskaźniki pisania',
  'settings.typingIndicatorsDesc': 'Pozwól innym widzieć, gdy piszesz',
  'settings.usedOf': 'użyte z',
  'settings.videoQuality_auto': 'Automatyczna',
  'settings.videoQuality_high': 'Wysoka',
  'settings.videoQuality_low': 'Niska',
  'settings.videoQuality_medium': 'Średnia',
  'settings.yourIdentity': 'Twoja tożsamość',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'pl') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (plTranslations[key]) {
    const newValue = plTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Polish translations.`)
