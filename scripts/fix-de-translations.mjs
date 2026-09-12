import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const deTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Foto hochladen',
  'avatar.cropAvatar': 'Avatar zuschneiden',
  'avatar.cancel': 'Abbrechen',
  'avatar.cropSave': 'Zuschneiden & speichern',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Serververbindung aktualisieren',
  'calls.noContactsFound': 'Keine Kontakte gefunden',
  'calls.startCallHint': 'Starten Sie einen Anruf aus der Kontaktliste',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Kontakte aus Hyperbee-Speicher neu laden',
  'contacts.displayNameOptional': 'Anzeigename (optional)',
  'contacts.displayNamePlaceholder': 'Wie sollen sie erscheinen?',
  'contacts.selectContact': 'Wählen Sie einen Kontakt zum Anzeigen der Details',
  'contacts.noBlockedContacts': 'Keine blockierten Kontakte',
  'contacts.noContactsFound': 'Keine Kontakte gefunden',

  // ─── groups ───
  'groups.admins': 'Administratoren',
  'groups.groups': 'Gruppen',
  'groups.create': 'Erstellen',
  'groups.searchGroups': 'Gruppen suchen…',
  'groups.noGroupsFound': 'Keine Gruppen gefunden',
  'groups.noGroupsYet': 'Noch keine Gruppen',
  'groups.createGroupHint': 'Erstellen Sie eine Gruppe für die Zusammenarbeit',
  'groups.createFirstGroup': 'Erstellen Sie Ihre erste Gruppe',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Antwort abbrechen',
  'messageInput.attachFile': 'Datei anhängen',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Nachricht senden',
  'messageInput.dropFiles': 'Dateien hier ablegen',
  'messageInput.replyingTo': 'Antwort an',
  'messageInput.messageDeleted': 'Nachricht gelöscht',

  // ─── modal ───
  'modal.addContact': 'Kontakt hinzufügen',
  'modal.publicKey': 'Öffentlicher Schlüssel',
  'modal.publicKeyPlaceholder': 'Geben Sie den öffentlichen Schlüssel des Kontakts ein…',
  'modal.displayName': 'Anzeigename (optional)',
  'modal.displayNamePlaceholder': 'Geben Sie diesem Kontakt einen Namen…',
  'modal.cancel': 'Abbrechen',
  'modal.add': 'Hinzufügen',
  'modal.shareKey': 'Teilen Sie Ihren öffentlichen Schlüssel mit Ihrem Kontakt, damit er Sie ebenfalls hinzufügen kann. Sie finden ihn unter Einstellungen → Profil.',
  'modal.error.publicKeyRequired': 'Öffentlicher Schlüssel ist erforderlich',
  'modal.error.publicKeyTooShort': 'Öffentlicher Schlüssel ist zu kurz',
  'modal.error.contactExists': 'Kontakt existiert bereits',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimieren',
  'titlebar.maximize': 'Maximieren',
  'titlebar.close': 'Schließen',

  // ─── toast ───
  'toast.dismiss': 'Schließen',
  'toast.dataImported': 'Daten erfolgreich importiert',
  'toast.importFailed': 'Import fehlgeschlagen',
  'toast.invalidBackupFile': 'Ungültige Sicherungsdatei',
  'toast.cacheCleared': 'Cache geleert',
  'toast.failedToClearCache': 'Cache-Leerung fehlgeschlagen',
  'toast.permissionGranted': 'Berechtigung erteilt',
  'toast.permissionDenied': 'Berechtigung verweigert',
  'toast.microphoneUpdated': 'Mikrofon aktualisiert',
  'toast.cameraUpdated': 'Kamera aktualisiert',
  'toast.speakerUpdated': 'Lautsprecher aktualisiert',
  'toast.cameraTestFailed': 'Kameratest fehlgeschlagen',
  'toast.addressCopied': 'Adresse in die Zwischenablage kopiert',
  'toast.failedToCopyAddress': 'Adresse konnte nicht kopiert werden',
  'toast.contactAdded': 'Kontakt hinzugefügt — Erkennung gestartet',
  'toast.failedToAddContact': 'Kontakt konnte nicht hinzugefügt werden',

  // ─── settings ───
  'settings.audio': 'Audio',
  'settings.fileType_audio': 'Audio',
  'settings.profile': 'Profil',
  'settings.appVersion': 'Version {{version}}',
  'settings.accessibilitySubtitle': 'Machen Sie Asgard zugänglicher für Sie',
  'settings.atTheFollowingAddress': 'an der folgenden Adresse:',
  'settings.audioQuality_high': 'Hoch',
  'settings.audioQuality_low': 'Niedrig',
  'settings.audioQuality_medium': 'Mittel',
  'settings.autoDownload': 'Automatischer Download',
  'settings.autoDownloadAudioDesc': 'Audio-Nachrichten automatisch herunterladen',
  'settings.autoDownloadImagesDesc': 'Bilder automatisch herunterladen',
  'settings.autoDownloadVideosDesc': 'Videos automatisch herunterladen',
  'settings.autoEmoji': 'Automatische Emojis',
  'settings.autoEmojiDesc': 'Text-Kürzel wie :) in Emojis umwandeln',
  'settings.autoPlayGifs': 'GIFs automatisch abspielen',
  'settings.autoPlayGifsDesc': 'GIF-Bilder automatisch animieren',
  'settings.autoPlayVideos': 'Videos automatisch abspielen',
  'settings.autoPlayVideosDesc': 'Videos automatisch abspielen, wenn sichtbar',
  'settings.bandwidth': 'Bandbreite',
  'settings.batterySaver': 'Energiesparmodus',
  'settings.batterySaverDesc': 'P2P unterbrechen, wenn die App im Hintergrund läuft',
  'settings.builtWith': 'Erstellt mit: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Kamera',
  'settings.cameraTestFailed': 'Kameratest fehlgeschlagen',
  'settings.cameraUpdated': 'Kamera aktualisiert',
  'settings.cameras': 'Kameras',
  'settings.chatDensity_comfortable': 'Komfortabel',
  'settings.chatDensity_compact': 'Kompakt',
  'settings.chatDensity_cozy': 'Komfortabel',
  'settings.chatSubtitle': 'Konfigurieren Sie Ihr Chat-Erlebnis',
  'settings.clearCache': 'Cache leeren',
  'settings.clickToCopy': 'Zum Kopieren klicken',
  'settings.collapseMessages': 'Nachrichten einklappen',
  'settings.collapseMessagesDesc': 'Aufeinanderfolgende Nachrichten desselben Absenders gruppieren',
  'settings.compressImages': 'Bilder komprimieren',
  'settings.compressImagesDesc': 'Bilder vor dem Senden komprimieren',
  'settings.compressVideos': 'Videos komprimieren',
  'settings.compressVideosDesc': 'Videos vor dem Senden komprimieren, um den Datenverbrauch zu reduzieren',
  'settings.connected': 'Verbunden',
  'settings.connecting': 'Verbinde',
  'settings.connectionStatus': 'Verbindungsstatus',
  'settings.copied': 'Kopiert!',
  'settings.copyToClipboard': 'In die Zwischenablage kopieren',
  'settings.defaultAudioQuality': 'Standard-Audioqualität',
  'settings.defaultSpeaker': 'Standard-Lautsprecher',
  'settings.defaultVideoQuality': 'Standard-Videoqualität',
  'settings.detectedHardware': 'Erkannte Hardware',
  'settings.devicesAreAutoDetected': 'Geräte werden automatisch erkannt. Änderungen werden sofort angewendet.',
  'settings.disconnected': 'Getrennt',
  'settings.doNotDisturb': 'Nicht stören',
  'settings.doNotDisturbDesc': 'Alle Benachrichtigungen unterdrücken',
  'settings.doYouLikeAsgard': 'Gefällt Ihnen die Asgard-App?',
  'settings.donationIn': 'Spenden in',
  'settings.enableNotifications': 'Benachrichtigungen aktivieren',
  'settings.enableNotificationsDesc': 'Windows-Benachrichtigungen für neue Nachrichten anzeigen',
  'settings.enableRelay': 'Relais aktivieren',
  'settings.enableRelayDesc': 'Blind-Relays verwenden, wenn direkte Verbindungen nicht verfügbar sind',
  'settings.exportData': 'Daten exportieren',
  'settings.flushDht': 'DHT leeren',
  'settings.grantPermission': 'Berechtigung erteilen',
  'settings.grantPermissionDesc': 'Erteilen Sie die Berechtigung, um Gerätenamen zu sehen und Ihre Hardware einzurichten.',
  'settings.hideRecoveryPhrase': 'Wiederherstellungssatz verbergen',
  'settings.highContrast': 'Hoher Kontrast',
  'settings.highContrastDesc': 'Kontrast für bessere Sichtbarkeit erhöhen',
  'settings.importData': 'Daten importieren',
  'settings.inlinePreviews': 'Inline-Vorschauen',
  'settings.inlinePreviewsDesc': 'Bildvorschauen direkt im Chat anzeigen',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Tastaturnavigation',
  'settings.keyboardNavigationDesc': 'Tastenkürzel und Fokusanzeigen anzeigen',
  'settings.largerTouchTargets': 'Größere Touch-Ziele',
  'settings.largerTouchTargetsDesc': 'Schaltflächen und interaktive Elemente größer machen',
  'settings.linkPreviews': 'Link-Vorschauen',
  'settings.linkPreviewsDesc': 'Link-Vorschauen automatisch abrufen und anzeigen (kann Ihr Surfverhalten offenlegen)',
  'settings.localCache': 'Lokaler Cache',
  'settings.manageTrash': 'Papierkorb verwalten',
  'settings.maxPeers': 'Maximale Anzahl Peers',
  'settings.mbLimit': 'MB-Limit',
  'settings.mediaSubtitle': 'Konfigurieren Sie Medienwiedergabe und Komprimierung',
  'settings.mentionsOnly': 'Nur Erwähnungen',
  'settings.mentionsOnlyDesc': 'Nur bei Erwähnungen und direkten Nachrichten benachrichtigen',
  'settings.messageDensity': 'Nachrichtendichte',
  'settings.messagePreview': 'Nachrichtenvorschau',
  'settings.messagePreviewDesc': 'Nachrichteninhalt in Benachrichtigungen anzeigen',
  'settings.microphone': 'Mikrofon',
  'settings.microphoneAccess': 'Mikrofon- und Kamerazugriff',
  'settings.microphoneUpdated': 'Mikrofon aktualisiert',
  'settings.microphones': 'Mikrofone',
  'settings.muteByDefault': 'Standardmäßig stumm',
  'settings.muteByDefaultDesc': 'Videos im stummen Modus starten',
  'settings.networkSubtitle': 'P2P-Verbindungseinstellungen',
  'settings.neverShareRecoveryPhrase': 'Teilen Sie niemals Ihren Wiederherstellungssatz!',
  'settings.new': 'Neu',
  'settings.notAvailable': 'Nicht verfügbar',
  'settings.notificationSoundDesc': 'Ton für neue Nachrichten abspielen',
  'settings.onlineStatus': 'Online-Status',
  'settings.onlineStatusDesc': 'Ihren Kontakten Ihren Online-Status anzeigen',
  'settings.peerLatency': 'Peer-Latenz',
  'settings.peerQuality': 'Peer-Qualität',
  'settings.peers': 'Peers',
  'settings.readReceipts': 'Lesebestätigungen',
  'settings.readReceiptsDesc': 'Andere wissen lassen, wenn Sie ihre Nachrichten gelesen haben',
  'settings.recoveryPhrase': 'Wiederherstellungssatz',
  'settings.recoveryPhraseDesc': 'Ihr 24-Wort-Wiederherstellungssatz kann verwendet werden, um Ihre Identität auf einem anderen Gerät wiederherzustellen. Bewahren Sie ihn sicher auf und teilen Sie ihn niemals.',
  'settings.recoveryPhraseWarning': 'Jeder mit diesen Wörtern kann auf Ihr Konto zugreifen.',
  'settings.reducedMotion': 'Animationen reduzieren',
  'settings.reducedMotionDesc': 'Animationen und Übergänge minimieren',
  'settings.screenReaderOptimizations': 'Screenreader-Optimierungen',
  'settings.screenReaderOptimizationsDesc': 'Verbesserte Unterstützung für Screenreader',
  'settings.securitySubtitle': 'Verwalten Sie Ihre Identität und Ihren Wiederherstellungssatz',
  'settings.sendOnEnter': 'Mit Enter senden',
  'settings.sendOnEnterDesc': 'Enter drücken zum Senden, Shift+Enter für neue Zeile',
  'settings.showReadStatus': 'Lesestatus anzeigen',
  'settings.showReadStatusDesc': 'Lesebestätigungen bei gesendeten Nachrichten anzeigen',
  'settings.showRecoveryPhrase': 'Wiederherstellungssatz anzeigen',
  'settings.showSeconds': 'Sekunden anzeigen',
  'settings.showSecondsDesc': 'Sekunden zu Zeitstempeln hinzufügen',
  'settings.showTimestamps': 'Zeitstempel anzeigen',
  'settings.showTimestampsDesc': 'Zeit neben jeder Nachricht anzeigen',
  'settings.showVideoControls': 'Videosteuerung anzeigen',
  'settings.showVideoControlsDesc': 'Wiedergabesteuerung bei Videos anzeigen',
  'settings.speaker': 'Lautsprecher',
  'settings.speakerUpdated': 'Lautsprecher aktualisiert',
  'settings.speakers': 'Lautsprecher',
  'settings.stopTest': 'Test stoppen',
  'settings.storageSubtitle': 'Verwalten Sie lokale Daten und Downloads',
  'settings.suspended': 'Angehalten',
  'settings.testCamera': 'Kamera testen',
  'settings.testMic': 'Mikrofon testen',
  'settings.textToSpeech': 'Text-to-Speech',
  'settings.textToSpeechDesc': 'Nachrichten vorlesen',
  'settings.topics': 'Themen',
  'settings.tradeCryptocurrencyPrivately': 'Privat mit Kryptowährungen handeln',
  'settings.typingIndicators': 'Tipp-Indikatoren',
  'settings.typingIndicatorsDesc': 'Andere sehen lassen, wenn Sie tippen',
  'settings.usedOf': 'verwendet von',
  'settings.videoQuality_auto': 'Automatisch',
  'settings.videoQuality_high': 'Hoch',
  'settings.videoQuality_low': 'Niedrig',
  'settings.videoQuality_medium': 'Mittel',
  'settings.yourIdentity': 'Ihre Identität',

  // ─── contacts errors ───
  'contacts.error.publicKeyRequired': 'Bitte geben Sie einen öffentlichen Schlüssel ein',
  'contacts.error.invalidPublicKey': 'Ungültiges Format des öffentlichen Schlüssels',
  'contacts.error.noIdentity': 'Keine Identität verfügbar',
  'contacts.error.noContactsFound': 'Keine Kontakte im Hyperbee-Speicher gefunden',
  'contacts.error.failedToReload': 'Kontakte konnten nicht neu geladen werden',
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
  
  if (currentLang !== 'de') continue
  
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  
  const [, indent, key, oldValue, comma] = keyMatch
  if (deTranslations[key]) {
    const newValue = deTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} German translations.`)
