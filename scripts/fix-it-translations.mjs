import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const itTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Carica foto',
  'avatar.cropAvatar': 'Ritaglia avatar',
  'avatar.cancel': 'Annulla',
  'avatar.cropSave': 'Ritaglia e salva',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Aggiorna connessione al server',
  'calls.noContactsFound': 'Nessun contatto trovato',
  'calls.startCallHint': 'Avvia una chiamata dalla lista contatti',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Ricarica contatti da archivio Hyperbee',
  'contacts.displayNameOptional': 'Nome visualizzato (opzionale)',
  'contacts.displayNamePlaceholder': 'Come dovrebbero apparire?',
  'contacts.selectContact': 'Seleziona un contatto per visualizzare i dettagli',
  'contacts.noBlockedContacts': 'Nessun contatto bloccato',
  'contacts.noContactsFound': 'Nessun contatto trovato',
  'contacts.error.publicKeyRequired': 'Inserisci una chiave pubblica',
  'contacts.error.invalidPublicKey': 'Formato chiave pubblica non valido',
  'contacts.error.noIdentity': 'Nessuna identità disponibile',
  'contacts.error.noContactsFound': 'Nessun contatto trovato nell\'archivio Hyperbee',
  'contacts.error.failedToReload': 'Ricaricamento contatti fallito',

  // ─── groups ───
  'groups.admins': 'Amministratori',
  'groups.groups': 'Gruppi',
  'groups.create': 'Crea',
  'groups.searchGroups': 'Cerca gruppi…',
  'groups.noGroupsFound': 'Nessun gruppo trovato',
  'groups.noGroupsYet': 'Nessun gruppo ancora',
  'groups.createGroupHint': 'Crea un gruppo per iniziare a collaborare',
  'groups.createFirstGroup': 'Crea il tuo primo gruppo',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Annulla risposta',
  'messageInput.attachFile': 'Allega file',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Invia messaggio',
  'messageInput.dropFiles': 'Trascina i file qui',
  'messageInput.replyingTo': 'Rispondendo a',
  'messageInput.messageDeleted': 'Messaggio eliminato',

  // ─── modal ───
  'modal.addContact': 'Aggiungi contatto',
  'modal.publicKey': 'Chiave pubblica',
  'modal.publicKeyPlaceholder': 'Inserisci la chiave pubblica del contatto…',
  'modal.displayName': 'Nome visualizzato (opzionale)',
  'modal.displayNamePlaceholder': 'Dai un nome a questo contatto…',
  'modal.cancel': 'Annulla',
  'modal.add': 'Aggiungi',
  'modal.shareKey': 'Condividi la tua chiave pubblica con il tuo contatto affinché possa aggiungerti. La trovi in Impostazioni → Profilo.',
  'modal.error.publicKeyRequired': 'La chiave pubblica è obbligatoria',
  'modal.error.publicKeyTooShort': 'La chiave pubblica è troppo corta',
  'modal.error.contactExists': 'Il contatto esiste già',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimizza',
  'titlebar.maximize': 'Massimizza',
  'titlebar.close': 'Chiudi',

  // ─── toast ───
  'toast.dismiss': 'Chiudi',
  'toast.dataImported': 'Dati importati con successo',
  'toast.importFailed': 'Importazione fallita',
  'toast.invalidBackupFile': 'File di backup non valido',
  'toast.cacheCleared': 'Cache svuotata',
  'toast.failedToClearCache': 'Impossibile svuotare la cache',
  'toast.permissionGranted': 'Autorizzazione concessa',
  'toast.permissionDenied': 'Autorizzazione negata',
  'toast.microphoneUpdated': 'Microfono aggiornato',
  'toast.cameraUpdated': 'Fotocamera aggiornata',
  'toast.speakerUpdated': 'Altoparlante aggiornato',
  'toast.cameraTestFailed': 'Test fotocamera fallito',
  'toast.addressCopied': 'Indirizzo copiato negli appunti',
  'toast.failedToCopyAddress': 'Impossibile copiare l\'indirizzo',
  'toast.contactAdded': 'Contatto aggiunto — rilevamento avviato',
  'toast.failedToAddContact': 'Impossibile aggiungere il contatto',

  // ─── settings ───
  'settings.audio': 'Audio',
  'settings.fileType_audio': 'Audio',
  'settings.profile': 'Profilo',
  'settings.appVersion': 'Versione {{version}}',
  'settings.accessibilitySubtitle': 'Rendi Asgard più accessibile per te',
  'settings.atTheFollowingAddress': 'al seguente indirizzo:',
  'settings.audioQuality_high': 'Alta',
  'settings.audioQuality_low': 'Bassa',
  'settings.audioQuality_medium': 'Media',
  'settings.autoDownload': 'Download automatico',
  'settings.autoDownloadAudioDesc': 'Scarica automaticamente i messaggi audio',
  'settings.autoDownloadImagesDesc': 'Scarica automaticamente le immagini',
  'settings.autoDownloadVideosDesc': 'Scarica automaticamente i video',
  'settings.autoEmoji': 'Emoji automatiche',
  'settings.autoEmojiDesc': 'Converti scorciatoie di testo come :) in emoji',
  'settings.autoPlayGifs': 'Riproduci GIF automaticamente',
  'settings.autoPlayGifsDesc': 'Anima automaticamente le immagini GIF',
  'settings.autoPlayVideos': 'Riproduci video automaticamente',
  'settings.autoPlayVideosDesc': 'Riproduci automaticamente i video quando visibili',
  'settings.bandwidth': 'Larghezza di banda',
  'settings.batterySaver': 'Risparmio batteria',
  'settings.batterySaverDesc': 'Sospendi P2P quando l\'app è in background',
  'settings.builtWith': 'Realizzato con: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Fotocamera',
  'settings.cameraTestFailed': 'Test fotocamera fallito',
  'settings.cameraUpdated': 'Fotocamera aggiornata',
  'settings.cameras': 'Fotocamere',
  'settings.chatDensity_comfortable': 'Confortevole',
  'settings.chatDensity_compact': 'Compatto',
  'settings.chatDensity_cozy': 'Confortevole',
  'settings.chatSubtitle': 'Configura la tua esperienza di messaggistica',
  'settings.clearCache': 'Svuota cache',
  'settings.clickToCopy': 'Clicca per copiare',
  'settings.collapseMessages': 'Comprimi messaggi',
  'settings.collapseMessagesDesc': 'Raggruppa messaggi consecutivi dello stesso mittente',
  'settings.compressImages': 'Comprimi immagini',
  'settings.compressImagesDesc': 'Comprimi le immagini prima dell\'invio',
  'settings.compressVideos': 'Comprimi video',
  'settings.compressVideosDesc': 'Comprimi i video prima dell\'invio per ridurre l\'uso dei dati',
  'settings.connected': 'Connesso',
  'settings.connecting': 'Connessione in corso',
  'settings.connectionStatus': 'Stato della connessione',
  'settings.copied': 'Copiato!',
  'settings.copyToClipboard': 'Copia negli appunti',
  'settings.defaultAudioQuality': 'Qualità audio predefinita',
  'settings.defaultSpeaker': 'Altoparlante predefinito',
  'settings.defaultVideoQuality': 'Qualità video predefinita',
  'settings.detectedHardware': 'Hardware rilevato',
  'settings.devicesAreAutoDetected': 'I dispositivi vengono rilevati automaticamente. Le modifiche vengono applicate in tempo reale.',
  'settings.disconnected': 'Disconnesso',
  'settings.doNotDisturb': 'Non disturbare',
  'settings.doNotDisturbDesc': 'Elimina tutte le notifiche',
  'settings.doYouLikeAsgard': 'Ti piace l\'app Asgard?',
  'settings.donationIn': 'Fai una donazione in',
  'settings.enableNotifications': 'Attiva notifiche',
  'settings.enableNotificationsDesc': 'Mostra notifiche Windows per i nuovi messaggi',
  'settings.enableRelay': 'Attiva relay',
  'settings.enableRelayDesc': 'Usa relay ciechi quando le connessioni dirette non sono disponibili',
  'settings.exportData': 'Esporta dati',
  'settings.flushDht': 'Svuota DHT',
  'settings.grantPermission': 'Concedi autorizzazione',
  'settings.grantPermissionDesc': 'Concedi l\'autorizzazione per vedere i nomi dei dispositivi e configurare l\'hardware.',
  'settings.hideRecoveryPhrase': 'Nascondi frase di recupero',
  'settings.highContrast': 'Alto contrasto',
  'settings.highContrastDesc': 'Aumenta il contrasto per una migliore visibilità',
  'settings.importData': 'Importa dati',
  'settings.inlinePreviews': 'Anteprime integrate',
  'settings.inlinePreviewsDesc': 'Mostra le anteprime delle immagini direttamente nella chat',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Navigazione da tastiera',
  'settings.keyboardNavigationDesc': 'Mostra scorciatoie da tastiera e indicatori di focus',
  'settings.largerTouchTargets': 'Bersagli touch più grandi',
  'settings.largerTouchTargetsDesc': 'Rendi i pulsanti e gli elementi interattivi più facili da toccare',
  'settings.linkPreviews': 'Anteprime link',
  'settings.linkPreviewsDesc': 'Recupera e mostra automaticamente le anteprime dei link (potrebbe rivelare la tua attività di navigazione)',
  'settings.localCache': 'Cache locale',
  'settings.manageTrash': 'Gestisci cestino',
  'settings.maxPeers': 'Numero massimo di peer',
  'settings.mbLimit': 'Limite MB',
  'settings.mediaSubtitle': 'Configura la riproduzione e la compressione dei media',
  'settings.mentionsOnly': 'Solo menzioni',
  'settings.mentionsOnlyDesc': 'Notifica solo per menzioni e messaggi diretti',
  'settings.messageDensity': 'Densità messaggi',
  'settings.messagePreview': 'Anteprima messaggio',
  'settings.messagePreviewDesc': 'Mostra il contenuto del messaggio nelle notifiche',
  'settings.microphone': 'Microfono',
  'settings.microphoneAccess': 'Accesso microfono e fotocamera',
  'settings.microphoneUpdated': 'Microfono aggiornato',
  'settings.microphones': 'Microfoni',
  'settings.muteByDefault': 'Muto per impostazione predefinita',
  'settings.muteByDefaultDesc': 'Avvia i video in modalità muto',
  'settings.networkSubtitle': 'Impostazioni connessione P2P',
  'settings.neverShareRecoveryPhrase': 'Non condividere mai la tua frase di recupero!',
  'settings.new': 'Nuovo',
  'settings.notAvailable': 'Non disponibile',
  'settings.notificationSoundDesc': 'Riproduci un suono per i nuovi messaggi',
  'settings.onlineStatus': 'Stato online',
  'settings.onlineStatusDesc': 'Consenti ai tuoi contatti di vedere il tuo stato online',
  'settings.peerLatency': 'Latenza peer',
  'settings.peerQuality': 'Qualità peer',
  'settings.peers': 'Peer',
  'settings.readReceipts': 'Conferme di lettura',
  'settings.readReceiptsDesc': 'Informa gli altri quando hai letto i loro messaggi',
  'settings.recoveryPhrase': 'Frase di recupero',
  'settings.recoveryPhraseDesc': 'La tua frase di recupero di 24 parole può essere utilizzata per ripristinare la tua identità su un altro dispositivo. Tienila al sicuro e non condividerla mai.',
  'settings.recoveryPhraseWarning': 'Chiunque possieda queste parole può accedere al tuo account.',
  'settings.reducedMotion': 'Riduci animazioni',
  'settings.reducedMotionDesc': 'Minimizza animazioni e transizioni',
  'settings.screenReaderOptimizations': 'Ottimizzazioni per screen reader',
  'settings.screenReaderOptimizationsDesc': 'Supporto migliorato per screen reader',
  'settings.securitySubtitle': 'Gestisci la tua identità e la frase di recupero',
  'settings.sendOnEnter': 'Invia con Invio',
  'settings.sendOnEnterDesc': 'Premi Invio per inviare, Maiusc+Invio per nuova riga',
  'settings.showReadStatus': 'Mostra stato di lettura',
  'settings.showReadStatusDesc': 'Mostra le conferme di lettura sui messaggi inviati',
  'settings.showRecoveryPhrase': 'Mostra frase di recupero',
  'settings.showSeconds': 'Mostra secondi',
  'settings.showSecondsDesc': 'Includi i secondi nei timestamp',
  'settings.showTimestamps': 'Mostra timestamp',
  'settings.showTimestampsDesc': 'Mostra l\'ora accanto a ogni messaggio',
  'settings.showVideoControls': 'Mostra controlli video',
  'settings.showVideoControlsDesc': 'Mostra i comandi di riproduzione sui video',
  'settings.speaker': 'Altoparlante',
  'settings.speakerUpdated': 'Altoparlante aggiornato',
  'settings.speakers': 'Altoparlanti',
  'settings.stopTest': 'Interrompi test',
  'settings.storageSubtitle': 'Gestisci dati locali e download',
  'settings.suspended': 'Sospeso',
  'settings.testCamera': 'Testa fotocamera',
  'settings.testMic': 'Testa microfono',
  'settings.textToSpeech': 'Sintesi vocale',
  'settings.textToSpeechDesc': 'Leggi i messaggi ad alta voce',
  'settings.topics': 'Argomenti',
  'settings.tradeCryptocurrencyPrivately': 'Commercia criptovalute in privato',
  'settings.typingIndicators': 'Indicatori di digitazione',
  'settings.typingIndicatorsDesc': 'Consenti agli altri di vedere quando stai digitando',
  'settings.usedOf': 'utilizzato di',
  'settings.videoQuality_auto': 'Automatico',
  'settings.videoQuality_high': 'Alta',
  'settings.videoQuality_low': 'Bassa',
  'settings.videoQuality_medium': 'Media',
  'settings.yourIdentity': 'La tua identità',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'it') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (itTranslations[key]) {
    const newValue = itTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Italian translations.`)
