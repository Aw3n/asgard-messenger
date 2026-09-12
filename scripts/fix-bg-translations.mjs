import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const bgTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Качване на снимка',
  'avatar.cropAvatar': 'Изрязване на аватар',
  'avatar.cancel': 'Отказ',
  'avatar.cropSave': 'Изрязване и запазване',

  // ─── calls ───
  'calls.openChat': 'Чат',
  'calls.refreshServer': 'Обновяване на връзката със сървъра',
  'calls.noContactsFound': 'Няма намерени контакти',
  'calls.startCallHint': 'Започнете обаждане от списъка с контакти',

  // ─── common ───
  'common.admin': 'Администратор',

  // ─── contacts ───
  'contacts.reloadContacts': 'Презареждане на контакти от хранилище Hyperbee',
  'contacts.displayNameOptional': 'Показвано име (по избор)',
  'contacts.displayNamePlaceholder': 'Как трябва да се показват?',
  'contacts.selectContact': 'Изберете контакт за преглед на детайли',
  'contacts.noBlockedContacts': 'Няма блокирани контакти',
  'contacts.noContactsFound': 'Няма намерени контакти',
  'contacts.error.publicKeyRequired': 'Въведете публичен ключ',
  'contacts.error.invalidPublicKey': 'Невалиден формат на публичен ключ',
  'contacts.error.noIdentity': 'Няма налична самоличност',
  'contacts.error.noContactsFound': 'Няма намерени контакти в хранилище Hyperbee',
  'contacts.error.failedToReload': 'Презареждането на контакти не успя',

  // ─── groups ───
  'groups.admins': 'Администратори',
  'groups.groups': 'Групи',
  'groups.create': 'Създаване',
  'groups.searchGroups': 'Търсене на групи…',
  'groups.noGroupsFound': 'Няма намерени групи',
  'groups.noGroupsYet': 'Все още няма групи',
  'groups.createGroupHint': 'Създайте група, за да започнете сътрудничество',
  'groups.createFirstGroup': 'Създайте първата си група',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Отказ на отговора',
  'messageInput.attachFile': 'Прикачване на файл',
  'messageInput.emoji': 'Емоджи',
  'messageInput.send': 'Изпращане на съобщение',
  'messageInput.dropFiles': 'Пуснете файлове тук',
  'messageInput.replyingTo': 'Отговор на',
  'messageInput.messageDeleted': 'Съобщението е изтрито',

  // ─── modal ───
  'modal.addContact': 'Добавяне на контакт',
  'modal.publicKey': 'Публичен ключ',
  'modal.publicKeyPlaceholder': 'Въведете публичния ключ на контакта…',
  'modal.displayName': 'Показвано име (по избор)',
  'modal.displayNamePlaceholder': 'Дайте име на този контакт…',
  'modal.cancel': 'Отказ',
  'modal.add': 'Добавяне',
  'modal.shareKey': 'Споделете публичния си ключ с контакта си, за да може и той да ви добави. Ще го намерите в Настройки → Профил.',
  'modal.error.publicKeyRequired': 'Публичният ключ е задължителен',
  'modal.error.publicKeyTooShort': 'Публичният ключ е твърде кратък',
  'modal.error.contactExists': 'Контактът вече съществува',

  // ─── panels ───
  'panels.info': 'Информация',

  // ─── titlebar ───
  'titlebar.minimize': 'Минимизиране',
  'titlebar.maximize': 'Максимизиране',
  'titlebar.close': 'Затваряне',

  // ─── toast ───
  'toast.dismiss': 'Затваряне',
  'toast.dataImported': 'Данните са импортирани успешно',
  'toast.importFailed': 'Импортирането не успя',
  'toast.invalidBackupFile': 'Невалиден файл за резервно копие',
  'toast.cacheCleared': 'Кешът е изчистен',
  'toast.failedToClearCache': 'Изчистването на кеша не успя',
  'toast.permissionGranted': 'Разрешението е дадено',
  'toast.permissionDenied': 'Разрешението е отказано',
  'toast.microphoneUpdated': 'Микрофонът е обновен',
  'toast.cameraUpdated': 'Камерата е обновена',
  'toast.speakerUpdated': 'Говорителят е обновен',
  'toast.cameraTestFailed': 'Тестът на камерата не успя',
  'toast.addressCopied': 'Адресът е копиран в клипборда',
  'toast.failedToCopyAddress': 'Копирането на адреса не успя',
  'toast.contactAdded': 'Контактът е добавен — откриването е стартирано',
  'toast.failedToAddContact': 'Добавянето на контакт не успя',

  // ─── settings ───
  'settings.audio': 'Аудио',
  'settings.fileType_audio': 'Аудио',
  'settings.profile': 'Профил',
  'settings.appVersion': 'Версия {{version}}',
  'settings.accessibilitySubtitle': 'Направете Asgard по-достъпен за вас',
  'settings.atTheFollowingAddress': 'на следния адрес:',
  'settings.audioQuality_high': 'Високо',
  'settings.audioQuality_low': 'Ниско',
  'settings.audioQuality_medium': 'Средно',
  'settings.autoDownload': 'Автоматично изтегляне',
  'settings.autoDownloadAudioDesc': 'Автоматично изтегляне на аудио съобщения',
  'settings.autoDownloadImagesDesc': 'Автоматично изтегляне на изображения',
  'settings.autoDownloadVideosDesc': 'Автоматично изтегляне на видеоклипове',
  'settings.autoEmoji': 'Автоматични емоджита',
  'settings.autoEmojiDesc': 'Конвертиране на текстови преки пътища като :) в емоджита',
  'settings.autoPlayGifs': 'Автоматично възпроизвеждане на GIF',
  'settings.autoPlayGifsDesc': 'Автоматично анимиране на GIF изображения',
  'settings.autoPlayVideos': 'Автоматично възпроизвеждане на видеоклипове',
  'settings.autoPlayVideosDesc': 'Автоматично възпроизвеждане на видеоклипове, когато са видими',
  'settings.bandwidth': 'Честотна лента',
  'settings.batterySaver': 'Пестене на батерия',
  'settings.batterySaverDesc': 'Спиране на P2P, когато приложението е във фонов режим',
  'settings.builtWith': 'Изградено с: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Камера',
  'settings.cameraTestFailed': 'Тестът на камерата не успя',
  'settings.cameraUpdated': 'Камерата е обновена',
  'settings.cameras': 'Камери',
  'settings.chatDensity_comfortable': 'Удобно',
  'settings.chatDensity_compact': 'Компактно',
  'settings.chatDensity_cozy': 'Удобно',
  'settings.chatSubtitle': 'Конфигурирайте вашето изживяване в чата',
  'settings.clearCache': 'Изчистване на кеша',
  'settings.clickToCopy': 'Кликнете за копиране',
  'settings.collapseMessages': 'Свиване на съобщенията',
  'settings.collapseMessagesDesc': 'Групиране на последователни съобщения от един и същ подател',
  'settings.compressImages': 'Компресиране на изображения',
  'settings.compressImagesDesc': 'Компресиране на изображения преди изпращане',
  'settings.compressVideos': 'Компресиране на видеоклипове',
  'settings.compressVideosDesc': 'Компресиране на видеоклипове преди изпращане за намаляване на използването на данни',
  'settings.connected': 'Свързано',
  'settings.connecting': 'Свързване',
  'settings.connectionStatus': 'Състояние на връзката',
  'settings.copied': 'Копирано!',
  'settings.copyToClipboard': 'Копиране в клипборда',
  'settings.defaultAudioQuality': 'Качество на звука по подразбиране',
  'settings.defaultSpeaker': 'Говорител по подразбиране',
  'settings.defaultVideoQuality': 'Качество на видеото по подразбиране',
  'settings.detectedHardware': 'Открит хардуер',
  'settings.devicesAreAutoDetected': 'Устройствата се откриват автоматично. Промените се прилагат в реално време.',
  'settings.disconnected': 'Прекъснато',
  'settings.doNotDisturb': 'Не безпокойте',
  'settings.doNotDisturbDesc': 'Потискане на всички известия',
  'settings.doYouLikeAsgard': 'Харесва ли ви приложението Asgard?',
  'settings.donationIn': 'Дарение в',
  'settings.enableNotifications': 'Активиране на известията',
  'settings.enableNotificationsDesc': 'Показване на известия от Windows за нови съобщения',
  'settings.enableRelay': 'Активиране на ретранслатор',
  'settings.enableRelayDesc': 'Използване на слепи ретранслатори, когато преките връзки не са налични',
  'settings.exportData': 'Експортиране на данни',
  'settings.flushDht': 'Изпразване на DHT',
  'settings.grantPermission': 'Даване на разрешение',
  'settings.grantPermissionDesc': 'Дайте разрешение за преглед на имената на устройствата и конфигуриране на хардуера.',
  'settings.hideRecoveryPhrase': 'Скриване на фразата за възстановяване',
  'settings.highContrast': 'Висок контраст',
  'settings.highContrastDesc': 'Увеличаване на контраста за по-добра видимост',
  'settings.importData': 'Импортиране на данни',
  'settings.inlinePreviews': 'Вградени прегледи',
  'settings.inlinePreviewsDesc': 'Показване на прегледи на изображения директно в чата',
  'settings.kbPerSecond': 'КБ/с',
  'settings.keyboardNavigation': 'Навигация с клавиатура',
  'settings.keyboardNavigationDesc': 'Показване на клавишни преки пътища и индикатори за фокус',
  'settings.largerTouchTargets': 'По-големи цели за докосване',
  'settings.largerTouchTargetsDesc': 'Направете бутоните и интерактивните елементи по-лесни за докосване',
  'settings.linkPreviews': 'Прегледи на връзки',
  'settings.linkPreviewsDesc': 'Автоматично получаване и показване на прегледи на връзки (може да разкрие вашата активност при сърфиране)',
  'settings.localCache': 'Локален кеш',
  'settings.manageTrash': 'Управление на кошчето',
  'settings.maxPeers': 'Максимален брой пиъри',
  'settings.mbLimit': 'MB ограничение',
  'settings.mediaSubtitle': 'Конфигурирайте възпроизвеждането и компресията на медии',
  'settings.mentionsOnly': 'Само споменавания',
  'settings.mentionsOnlyDesc': 'Известяване само за споменавания и директни съобщения',
  'settings.messageDensity': 'Плътност на съобщенията',
  'settings.messagePreview': 'Преглед на съобщение',
  'settings.messagePreviewDesc': 'Показване на съдържанието на съобщението в известията',
  'settings.microphone': 'Микрофон',
  'settings.microphoneAccess': 'Достъп до микрофон и камера',
  'settings.microphoneUpdated': 'Микрофонът е обновен',
  'settings.microphones': 'Микрофони',
  'settings.muteByDefault': 'Заглушено по подразбиране',
  'settings.muteByDefaultDesc': 'Стартиране на видеоклипове в тих режим',
  'settings.networkSubtitle': 'Настройки на P2P връзката',
  'settings.neverShareRecoveryPhrase': 'Никога не споделяйте фразата си за възстановяване!',
  'settings.new': 'Ново',
  'settings.notAvailable': 'Не е налично',
  'settings.notificationSoundDesc': 'Възпроизвеждане на звук за нови съобщения',
  'settings.onlineStatus': 'Онлайн състояние',
  'settings.onlineStatusDesc': 'Позволете на контактите си да виждат вашето онлайн състояние',
  'settings.peerLatency': 'Забавяне на пиърите',
  'settings.peerQuality': 'Качество на пиърите',
  'settings.peers': 'Пиъри',
  'settings.readReceipts': 'Разписки за прочитане',
  'settings.readReceiptsDesc': 'Информирайте другите, когато сте прочели съобщенията им',
  'settings.recoveryPhrase': 'Фраза за възстановяване',
  'settings.recoveryPhraseDesc': 'Вашата фраза за възстановяване от 24 думи може да бъде използвана за възстановяване на вашата самоличност на друго устройство. Пазете я на сигурно място и никога не я споделяйте.',
  'settings.recoveryPhraseWarning': 'Всеки с тези думи може да получи достъп до вашия акаунт.',
  'settings.reducedMotion': 'Намаляване на анимациите',
  'settings.reducedMotionDesc': 'Минимизиране на анимациите и преходите',
  'settings.screenReaderOptimizations': 'Оптимизации за екранен четец',
  'settings.screenReaderOptimizationsDesc': 'Подобрена поддръжка за екранни четци',
  'settings.securitySubtitle': 'Управлявайте вашата самоличност и фраза за възстановяване',
  'settings.sendOnEnter': 'Изпращане с Enter',
  'settings.sendOnEnterDesc': 'Натиснете Enter за изпращане, Shift+Enter за нов ред',
  'settings.showReadStatus': 'Показване на състоянието на четене',
  'settings.showReadStatusDesc': 'Показване на разписки за прочитане на изпратени съобщения',
  'settings.showRecoveryPhrase': 'Показване на фразата за възстановяване',
  'settings.showSeconds': 'Показване на секунди',
  'settings.showSecondsDesc': 'Включване на секунди в времевите клейма',
  'settings.showTimestamps': 'Показване на времеви клейма',
  'settings.showTimestampsDesc': 'Показване на времето до всяко съобщение',
  'settings.showVideoControls': 'Показване на контроли за видео',
  'settings.showVideoControlsDesc': 'Показване на контроли за възпроизвеждане на видеоклипове',
  'settings.speaker': 'Говорител',
  'settings.speakerUpdated': 'Говорителят е обновен',
  'settings.speakers': 'Говорители',
  'settings.stopTest': 'Спиране на теста',
  'settings.storageSubtitle': 'Управлявайте локални данни и изтегляния',
  'settings.suspended': 'Спряно',
  'settings.testCamera': 'Тестване на камерата',
  'settings.testMic': 'Тестване на микрофона',
  'settings.textToSpeech': 'Текст към реч',
  'settings.textToSpeechDesc': 'Четене на съобщения на глас',
  'settings.topics': 'Теми',
  'settings.tradeCryptocurrencyPrivately': 'Търгувайте с криптовалути частно',
  'settings.typingIndicators': 'Индикатори за писане',
  'settings.typingIndicatorsDesc': 'Позволете на другите да виждат, когато пишете',
  'settings.usedOf': 'използвано от',
  'settings.videoQuality_auto': 'Автоматично',
  'settings.videoQuality_high': 'Високо',
  'settings.videoQuality_low': 'Ниско',
  'settings.videoQuality_medium': 'Средно',
  'settings.yourIdentity': 'Вашата самоличност',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'bg') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (bgTranslations[key]) {
    const newValue = bgTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Bulgarian translations.`)
