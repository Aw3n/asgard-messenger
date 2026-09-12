import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const elTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Ανέβασμα φωτογραφίας',
  'avatar.cropAvatar': 'Περικοπή avatar',
  'avatar.cancel': 'Ακύρωση',
  'avatar.cropSave': 'Περικοπή και αποθήκευση',

  // ─── calls ───
  'calls.openChat': 'Συνομιλία',
  'calls.refreshServer': 'Ανανέωση σύνδεσης διακομιστή',
  'calls.noContactsFound': 'Δεν βρέθηκαν επαφές',
  'calls.startCallHint': 'Ξεκινήστε μια κλήση από τη λίστα επαφών',

  // ─── common ───
  'common.admin': 'Διαχειριστής',

  // ─── contacts ───
  'contacts.reloadContacts': 'Επαναφόρτωση επαφών από αποθήκευση Hyperbee',
  'contacts.displayNameOptional': 'Εμφανιζόμενο όνομα (προαιρετικό)',
  'contacts.displayNamePlaceholder': 'Πώς θα εμφανίζονται;',
  'contacts.selectContact': 'Επιλέξτε μια επαφή για να δείτε λεπτομέρειες',
  'contacts.noBlockedContacts': 'Κανένας μπλοκαρισμένος επαφής',
  'contacts.noContactsFound': 'Δεν βρέθηκαν επαφές',
  'contacts.error.publicKeyRequired': 'Εισαγάγετε ένα δημόσιο κλειδί',
  'contacts.error.invalidPublicKey': 'Μη έγκυρη μορφή δημόσιου κλειδιού',
  'contacts.error.noIdentity': 'Δεν υπάρχει διαθέσιμη ταυτότητα',
  'contacts.error.noContactsFound': 'Δεν βρέθηκαν επαφές στην αποθήκευση Hyperbee',
  'contacts.error.failedToReload': 'Αποτυχία επαναφόρτωσης επαφών',

  // ─── groups ───
  'groups.admins': 'Διαχειριστές',
  'groups.groups': 'Ομάδες',
  'groups.create': 'Δημιουργία',
  'groups.searchGroups': 'Αναζήτηση ομάδων…',
  'groups.noGroupsFound': 'Δεν βρέθηκαν ομάδες',
  'groups.noGroupsYet': 'Καμία ομάδα ακόμα',
  'groups.createGroupHint': 'Δημιουργήστε μια ομάδα για να ξεκινήσετε τη συνεργασία',
  'groups.createFirstGroup': 'Δημιουργήστε την πρώτη σας ομάδα',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Ακύρωση απάντησης',
  'messageInput.attachFile': 'Επισύναψη αρχείου',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Αποστολή μηνύματος',
  'messageInput.dropFiles': 'Αποθέστε αρχεία εδώ',
  'messageInput.replyingTo': 'Απάντηση σε',
  'messageInput.messageDeleted': 'Το μήνυμα διαγράφηκε',

  // ─── modal ───
  'modal.addContact': 'Προσθήκη επαφής',
  'modal.publicKey': 'Δημόσιο κλειδί',
  'modal.publicKeyPlaceholder': 'Εισαγάγετε το δημόσιο κλειδί της επαφής…',
  'modal.displayName': 'Εμφανιζόμενο όνομα (προαιρετικό)',
  'modal.displayNamePlaceholder': 'Δώστε ένα όνομα σε αυτή την επαφή…',
  'modal.cancel': 'Ακύρωση',
  'modal.add': 'Προσθήκη',
  'modal.shareKey': 'Μοιραστείτε το δημόσιο κλειδί σας με την επαφή σας ώστε να μπορεί να σας προσθέσει. Θα το βρείτε στις Ρυθμίσεις → Προφίλ.',
  'modal.error.publicKeyRequired': 'Το δημόσιο κλειδί είναι υποχρεωτικό',
  'modal.error.publicKeyTooShort': 'Το δημόσιο κλειδί είναι πολύ μικρό',
  'modal.error.contactExists': 'Η επαφή υπάρχει ήδη',

  // ─── panels ───
  'panels.info': 'Πληροφορίες',

  // ─── titlebar ───
  'titlebar.minimize': 'Ελαχιστοποίηση',
  'titlebar.maximize': 'Μεγιστοποίηση',
  'titlebar.close': 'Κλείσιμο',

  // ─── toast ───
  'toast.dismiss': 'Κλείσιμο',
  'toast.dataImported': 'Τα δεδομένα εισήχθησαν επιτυχώς',
  'toast.importFailed': 'Αποτυχία εισαγωγής',
  'toast.invalidBackupFile': 'Μη έγκυρο αρχείο αντιγράφου ασφαλείας',
  'toast.cacheCleared': 'Η cache εκκαθαρίστηκε',
  'toast.failedToClearCache': 'Αποτυχία εκκαθάρισης cache',
  'toast.permissionGranted': 'Άδεια παραχωρήθηκε',
  'toast.permissionDenied': 'Άδεια απορρίφθηκε',
  'toast.microphoneUpdated': 'Το μικρόφωνο ενημερώθηκε',
  'toast.cameraUpdated': 'Η κάμερα ενημερώθηκε',
  'toast.speakerUpdated': 'Το ηχείο ενημερώθηκε',
  'toast.cameraTestFailed': 'Ο δοκιμή κάμερας απέτυχε',
  'toast.addressCopied': 'Η διεύθυνση αντιγράφηκε στο πρόχειρο',
  'toast.failedToCopyAddress': 'Αποτυχία αντιγραφής διεύθυνσης',
  'toast.contactAdded': 'Η επαφή προστέθηκε — εντοπισμός ξεκίνησε',
  'toast.failedToAddContact': 'Αποτυχία προσθήκης επαφής',

  // ─── settings ───
  'settings.audio': 'Ήχος',
  'settings.fileType_audio': 'Ήχος',
  'settings.profile': 'Προφίλ',
  'settings.appVersion': 'Έκδοση {{version}}',
  'settings.accessibilitySubtitle': 'Κάντε το Asgard πιο προσιτό για εσάς',
  'settings.atTheFollowingAddress': 'στην ακόλουθη διεύθυνση:',
  'settings.audioQuality_high': 'Υψηλή',
  'settings.audioQuality_low': 'Χαμηλή',
  'settings.audioQuality_medium': 'Μέση',
  'settings.autoDownload': 'Αυτόματη λήψη',
  'settings.autoDownloadAudioDesc': 'Αυτόματη λήψη μηνυμάτων ήχου',
  'settings.autoDownloadImagesDesc': 'Αυτόματη λήψη εικόνων',
  'settings.autoDownloadVideosDesc': 'Αυτόματη λήψη βίντεο',
  'settings.autoEmoji': 'Αυτόματα emoji',
  'settings.autoEmojiDesc': 'Μετατροπή συντομεύσεων κειμένου όπως :) σε emoji',
  'settings.autoPlayGifs': 'Αυτόματη αναπαραγωγή GIF',
  'settings.autoPlayGifsDesc': 'Αυτόματη κίνηση εικόνων GIF',
  'settings.autoPlayVideos': 'Αυτόματη αναπαραγωγή βίντεο',
  'settings.autoPlayVideosDesc': 'Αυτόματη αναπαραγωγή βίντεο όταν είναι ορατά',
  'settings.bandwidth': 'Εύρος ζώνης',
  'settings.batterySaver': 'Εξοικονόμηση μπαταρίας',
  'settings.batterySaverDesc': 'Αναστολή P2P όταν η εφαρμογή είναι στο παρασκήνιο',
  'settings.builtWith': 'Κατασκευασμένο με: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Κάμερα',
  'settings.cameraTestFailed': 'Η δοκιμή κάμερας απέτυχε',
  'settings.cameraUpdated': 'Η κάμερα ενημερώθηκε',
  'settings.cameras': 'Κάμερες',
  'settings.chatDensity_comfortable': 'Άνετη',
  'settings.chatDensity_compact': 'Συμπαγής',
  'settings.chatDensity_cozy': 'Άνετη',
  'settings.chatSubtitle': 'Διαμορφώστε την εμπειρία συνομιλίας σας',
  'settings.clearCache': 'Εκκαθάριση cache',
  'settings.clickToCopy': 'Κλικ για αντιγραφή',
  'settings.collapseMessages': 'Σύμπτυξη μηνυμάτων',
  'settings.collapseMessagesDesc': 'Ομαδοποίηση διαδοχικών μηνυμάτων από τον ίδιο αποστολέα',
  'settings.compressImages': 'Συμπίεση εικόνων',
  'settings.compressImagesDesc': 'Συμπίεση εικόνων πριν την αποστολή',
  'settings.compressVideos': 'Συμπίεση βίντεο',
  'settings.compressVideosDesc': 'Συμπίεση βίντεο πριν την αποστολή για μείωση χρήσης δεδομένων',
  'settings.connected': 'Συνδεδεμένο',
  'settings.connecting': 'Σύνδεση',
  'settings.connectionStatus': 'Κατάσταση σύνδεσης',
  'settings.copied': 'Αντιγράφηκε!',
  'settings.copyToClipboard': 'Αντιγραφή στο πρόχειρο',
  'settings.defaultAudioQuality': 'Προεπιλεγμένη ποιότητα ήχου',
  'settings.defaultSpeaker': 'Προεπιλεγμένο ηχείο',
  'settings.defaultVideoQuality': 'Προεπιλεγμένη ποιότητα βίντεο',
  'settings.detectedHardware': 'Εντοπισμένο υλικό',
  'settings.devicesAreAutoDetected': 'Οι συσκευές εντοπίζονται αυτόματα. Οι αλλαγές εφαρμόζονται σε πραγματικό χρόνο.',
  'settings.disconnected': 'Αποσυνδεδεμένο',
  'settings.doNotDisturb': 'Μην ενοχλείτε',
  'settings.doNotDisturbDesc': 'Καταστολή όλων των ειδοποιήσεων',
  'settings.doYouLikeAsgard': 'Σας αρέσει η εφαρμογή Asgard;',
  'settings.donationIn': 'Δωρεά σε',
  'settings.enableNotifications': 'Ενεργοποίηση ειδοποιήσεων',
  'settings.enableNotificationsDesc': 'Εμφάνιση ειδοποιήσεων Windows για νέα μηνύματα',
  'settings.enableRelay': 'Ενεργοποίηση αναμετάδοσης',
  'settings.enableRelayDesc': 'Χρήση τυφλών αναμεταδοτών όταν οι άμεσες συνδέσεις δεν είναι διαθέσιμες',
  'settings.exportData': 'Εξαγωγή δεδομένων',
  'settings.flushDht': 'Εκκαθάριση DHT',
  'settings.grantPermission': 'Παραχώρηση άδειας',
  'settings.grantPermissionDesc': 'Παραχωρήστε άδεια για να δείτε ονόματα συσκευών και να ρυθμίσετε το υλικό σας.',
  'settings.hideRecoveryPhrase': 'Απόκρυψη φράσης ανάκτησης',
  'settings.highContrast': 'Υψηλή αντίθεση',
  'settings.highContrastDesc': 'Αύξηση αντίθεσης για καλύτερη ορατότητα',
  'settings.importData': 'Εισαγωγή δεδομένων',
  'settings.inlinePreviews': 'Ενσωματωμένες προεπισκοπήσεις',
  'settings.inlinePreviewsDesc': 'Εμφάνιση προεπισκοπήσεων εικόνων απευθείας στη συνομιλία',
  'settings.kbPerSecond': 'KB/δ',
  'settings.keyboardNavigation': 'Πλοήγηση πληκτρολογίου',
  'settings.keyboardNavigationDesc': 'Εμφάνιση συντομεύσεων πληκτρολογίου και δεικτών εστίασης',
  'settings.largerTouchTargets': 'Μεγαλύτεροι στόχοι αφής',
  'settings.largerTouchTargetsDesc': 'Μεγαλύτερα κουμπιά και διαδραστικά στοιχεία για ευκολότερη αφή',
  'settings.linkPreviews': 'Προεπισκοπήσεις συνδέσμων',
  'settings.linkPreviewsDesc': 'Αυτόματη λήψη και εμφάνιση προεπισκοπήσεων συνδέσμων (μπορεί να αποκαλύψει τη δραστηριότητα περιήγησής σας)',
  'settings.localCache': 'Τοπική cache',
  'settings.manageTrash': 'Διαχείριση κάδου',
  'settings.maxPeers': 'Μέγιστος αριθμός κόμβων',
  'settings.mbLimit': 'Όριο MB',
  'settings.mediaSubtitle': 'Διαμορφώστε την αναπαραγωγή και συμπίεση μέσων',
  'settings.mentionsOnly': 'Μόνο αναφορές',
  'settings.mentionsOnlyDesc': 'Ειδοποίηση μόνο για αναφορές και άμεσα μηνύματα',
  'settings.messageDensity': 'Πυκνότητα μηνυμάτων',
  'settings.messagePreview': 'Προεπισκόπηση μηνύματος',
  'settings.messagePreviewDesc': 'Εμφάνιση περιεχομένου μηνύματος στις ειδοποιήσεις',
  'settings.microphone': 'Μικρόφωνο',
  'settings.microphoneAccess': 'Πρόσβαση μικροφώνου και κάμερας',
  'settings.microphoneUpdated': 'Το μικρόφωνο ενημερώθηκε',
  'settings.microphones': 'Μικρόφωνα',
  'settings.muteByDefault': 'Σίγαση από προεπιλογή',
  'settings.muteByDefaultDesc': 'Εκκίνηση βίντεο σε λειτουργία σίγασης',
  'settings.networkSubtitle': 'Ρυθμίσεις σύνδεσης P2P',
  'settings.neverShareRecoveryPhrase': 'Μοιραστείτε ποτέ τη φράση ανάκτησής σας!',
  'settings.new': 'Νέο',
  'settings.notAvailable': 'Μη διαθέσιμο',
  'settings.notificationSoundDesc': 'Αναπαραγωγή ήχου για νέα μηνύματα',
  'settings.onlineStatus': 'Κατάσταση online',
  'settings.onlineStatusDesc': 'Επιτρέψτε στις επαφές σας να βλέπουν την κατάστασή σας online',
  'settings.peerLatency': 'Καθυστέρηση κόμβων',
  'settings.peerQuality': 'Ποιότητα κόμβων',
  'settings.peers': 'Κόμβοι',
  'settings.readReceipts': 'Αποδείξεις ανάγνωσης',
  'settings.readReceiptsDesc': 'Ενημερώστε τους άλλους όταν διαβάσετε τα μηνύματά τους',
  'settings.recoveryPhrase': 'Φράση ανάκτησης',
  'settings.recoveryPhraseDesc': 'Η φράση ανάκτησης 24 λέξεών σας μπορεί να χρησιμοποιηθεί για να επαναφέρετε την ταυτότητά σας σε άλλη συσκευή. Κρατήστε την ασφαλή και μην τη μοιραστείτε ποτέ.',
  'settings.recoveryPhraseWarning': 'Οποιοσδήποτε με αυτές τις λέξεις μπορεί να αποκτήσει πρόσβαση στον λογαριασμό σας.',
  'settings.reducedMotion': 'Μείωση κίνησης',
  'settings.reducedMotionDesc': 'Ελαχιστοποίηση κινήσεων και μεταβάσεων',
  'settings.screenReaderOptimizations': 'Βελτιστοποιήσεις αναγνώστη οθόνης',
  'settings.screenReaderOptimizationsDesc': 'Βελτιωμένη υποστήριξη για αναγνώστες οθόνης',
  'settings.securitySubtitle': 'Διαχειριστείτε την ταυτότητα και τη φράση ανάκτησής σας',
  'settings.sendOnEnter': 'Αποστολή με Enter',
  'settings.sendOnEnterDesc': 'Πατήστε Enter για αποστολή, Shift+Enter για νέα γραμμή',
  'settings.showReadStatus': 'Εμφάνιση κατάστασης ανάγνωσης',
  'settings.showReadStatusDesc': 'Εμφάνιση αποδείξεων ανάγνωσης στα σταλμένα μηνύματα',
  'settings.showRecoveryPhrase': 'Εμφάνιση φράσης ανάκτησης',
  'settings.showSeconds': 'Εμφάνιση δευτερολέπτων',
  'settings.showSecondsDesc': 'Συμπερίληψη δευτερολέπτων στις χρονικές σημάνσεις',
  'settings.showTimestamps': 'Εμφάνιση χρονικών σημάνσεων',
  'settings.showTimestampsDesc': 'Εμφάνιση ώρας δίπλα σε κάθε μήνυμα',
  'settings.showVideoControls': 'Εμφάνιση στοιχείων ελέγχου βίντεο',
  'settings.showVideoControlsDesc': 'Εμφάνιση εντολών αναπαραγωγής στα βίντεο',
  'settings.speaker': 'Ηχείο',
  'settings.speakerUpdated': 'Το ηχείο ενημερώθηκε',
  'settings.speakers': 'Ηχεία',
  'settings.stopTest': 'Διακοπή δοκιμής',
  'settings.storageSubtitle': 'Διαχειριστείτε τοπικά δεδομένα και λήψεις',
  'settings.suspended': 'Ανεσταλμένο',
  'settings.testCamera': 'Δοκιμή κάμερας',
  'settings.testMic': 'Δοκιμή μικροφώνου',
  'settings.textToSpeech': 'Κείμενο σε ομιλία',
  'settings.textToSpeechDesc': 'Ανάγνωση μηνυμάτων φωναχτά',
  'settings.topics': 'Θέματα',
  'settings.tradeCryptocurrencyPrivately': 'Ιδιωτικό εμπόριο κρυπτονομισμάτων',
  'settings.typingIndicators': 'Δείκτες πληκτρολόγησης',
  'settings.typingIndicatorsDesc': 'Επιτρέψτε στους άλλους να βλέπουν όταν πληκτρολογείτε',
  'settings.usedOf': 'χρησιμοποιημένο από',
  'settings.videoQuality_auto': 'Αυτόματο',
  'settings.videoQuality_high': 'Υψηλή',
  'settings.videoQuality_low': 'Χαμηλή',
  'settings.videoQuality_medium': 'Μέση',
  'settings.yourIdentity': 'Η ταυτότητά σας',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'el') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (elTranslations[key]) {
    const newValue = elTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Greek translations.`)
