import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const ukTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Завантажити фото',
  'avatar.cropAvatar': 'Обрізати аватар',
  'avatar.cancel': 'Скасувати',
  'avatar.cropSave': 'Обрізати та зберегти',

  // ─── calls ───
  'calls.openChat': 'Чат',
  'calls.refreshServer': 'Оновити з\'єднання з сервером',
  'calls.noContactsFound': 'Контактів не знайдено',
  'calls.startCallHint': 'Почніть дзвінок зі списку контактів',

  // ─── common ───
  'common.admin': 'Адміністратор',

  // ─── contacts ───
  'contacts.reloadContacts': 'Перезавантажити контакти зі сховища Hyperbee',
  'contacts.displayNameOptional': 'Ім\'я для відображення (необов\'язкове)',
  'contacts.displayNamePlaceholder': 'Як вони повинні відображатися?',
  'contacts.selectContact': 'Виберіть контакт для перегляду деталей',
  'contacts.noBlockedContacts': 'Немає заблокованих контактів',
  'contacts.noContactsFound': 'Контактів не знайдено',
  'contacts.error.publicKeyRequired': 'Введіть публічний ключ',
  'contacts.error.invalidPublicKey': 'Недійсний формат публічного ключа',
  'contacts.error.noIdentity': 'Ідентичність недоступна',
  'contacts.error.noContactsFound': 'Контактів не знайдено у сховищі Hyperbee',
  'contacts.error.failedToReload': 'Не вдалося перезавантажити контакти',

  // ─── groups ───
  'groups.admins': 'Адміністратори',
  'groups.groups': 'Групи',
  'groups.create': 'Створити',
  'groups.searchGroups': 'Шукати групи…',
  'groups.noGroupsFound': 'Груп не знайдено',
  'groups.noGroupsYet': 'Груп поки немає',
  'groups.createGroupHint': 'Створіть групу для початку співпраці',
  'groups.createFirstGroup': 'Створіть свою першу групу',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Скасувати відповідь',
  'messageInput.attachFile': 'Прикріпити файл',
  'messageInput.emoji': 'Емодзі',
  'messageInput.send': 'Надіслати повідомлення',
  'messageInput.dropFiles': 'Перетягніть файли сюди',
  'messageInput.replyingTo': 'Відповідь до',
  'messageInput.messageDeleted': 'Повідомлення видалено',

  // ─── modal ───
  'modal.addContact': 'Додати контакт',
  'modal.publicKey': 'Публічний ключ',
  'modal.publicKeyPlaceholder': 'Введіть публічний ключ контакту…',
  'modal.displayName': 'Ім\'я для відображення (необов\'язкове)',
  'modal.displayNamePlaceholder': 'Дайте ім\'я цьому контакту…',
  'modal.cancel': 'Скасувати',
  'modal.add': 'Додати',
  'modal.shareKey': 'Поділіться своїм публічним ключем з контактом, щоб вони також могли додати вас. Ви знайдете його в Налаштування → Профіль.',
  'modal.error.publicKeyRequired': 'Публічний ключ є обов\'язковим',
  'modal.error.publicKeyTooShort': 'Публічний ключ занадто короткий',
  'modal.error.contactExists': 'Контакт вже існує',

  // ─── panels ───
  'panels.info': 'Інформація',

  // ─── titlebar ───
  'titlebar.minimize': 'Мінімізувати',
  'titlebar.maximize': 'Максимізувати',
  'titlebar.close': 'Закрити',

  // ─── toast ───
  'toast.dismiss': 'Закрити',
  'toast.dataImported': 'Дані успішно імпортовані',
  'toast.importFailed': 'Імпортування не вдалося',
  'toast.invalidBackupFile': 'Недійсний файл резервної копії',
  'toast.cacheCleared': 'Кеш очищено',
  'toast.failedToClearCache': 'Не вдалося очистити кеш',
  'toast.permissionGranted': 'Дозвіл надано',
  'toast.permissionDenied': 'Дозвіл відмовлено',
  'toast.microphoneUpdated': 'Мікрофон оновлено',
  'toast.cameraUpdated': 'Камеру оновлено',
  'toast.speakerUpdated': 'Динамік оновлено',
  'toast.cameraTestFailed': 'Тест камери не вдався',
  'toast.addressCopied': 'Адресу скопійовано в буфер обміну',
  'toast.failedToCopyAddress': 'Не вдалося скопіювати адресу',
  'toast.contactAdded': 'Контакт додано — виявлення розпочато',
  'toast.failedToAddContact': 'Не вдалося додати контакт',

  // ─── settings ───
  'settings.audio': 'Аудіо',
  'settings.fileType_audio': 'Аудіо',
  'settings.profile': 'Профіль',
  'settings.appVersion': 'Версія {{version}}',
  'settings.accessibilitySubtitle': 'Зробіть Asgard доступнішим для вас',
  'settings.atTheFollowingAddress': 'за наступною адресою:',
  'settings.audioQuality_high': 'Висока',
  'settings.audioQuality_low': 'Низька',
  'settings.audioQuality_medium': 'Середня',
  'settings.autoDownload': 'Автоматичне завантаження',
  'settings.autoDownloadAudioDesc': 'Автоматично завантажувати аудіоповідомлення',
  'settings.autoDownloadImagesDesc': 'Автоматично завантажувати зображення',
  'settings.autoDownloadVideosDesc': 'Автоматично завантажувати відео',
  'settings.autoEmoji': 'Автоматичні емодзі',
  'settings.autoEmojiDesc': 'Перетворювати текстові скорочення як :) на емодзі',
  'settings.autoPlayGifs': 'Автоматично відтворювати GIF',
  'settings.autoPlayGifsDesc': 'Автоматично анімувати GIF зображення',
  'settings.autoPlayVideos': 'Автоматично відтворювати відео',
  'settings.autoPlayVideosDesc': 'Автоматично відтворювати відео, коли вони видимі',
  'settings.bandwidth': 'Пропускна здатність',
  'settings.batterySaver': 'Економія батареї',
  'settings.batterySaverDesc': 'Призупинити P2P, коли додаток у фоні',
  'settings.builtWith': 'Побудовано з: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Камера',
  'settings.cameraTestFailed': 'Тест камери не вдався',
  'settings.cameraUpdated': 'Камеру оновлено',
  'settings.cameras': 'Камери',
  'settings.chatDensity_comfortable': 'Зручна',
  'settings.chatDensity_compact': 'Компактна',
  'settings.chatDensity_cozy': 'Зручна',
  'settings.chatSubtitle': 'Налаштуйте свій досвід чату',
  'settings.clearCache': 'Очистити кеш',
  'settings.clickToCopy': 'Натисніть, щоб скопіювати',
  'settings.collapseMessages': 'Згорнути повідомлення',
  'settings.collapseMessagesDesc': 'Групувати послідовні повідомлення від одного відправника',
  'settings.compressImages': 'Стискати зображення',
  'settings.compressImagesDesc': 'Стискати зображення перед надсиланням',
  'settings.compressVideos': 'Стискати відео',
  'settings.compressVideosDesc': 'Стискати відео перед надсиланням для зменшення використання даних',
  'settings.connected': 'Підключено',
  'settings.connecting': 'Підключення',
  'settings.connectionStatus': 'Стан підключення',
  'settings.copied': 'Скопійовано!',
  'settings.copyToClipboard': 'Копіювати в буфер обміну',
  'settings.defaultAudioQuality': 'Якість звуку за замовчуванням',
  'settings.defaultSpeaker': 'Динамік за замовчуванням',
  'settings.defaultVideoQuality': 'Якість відео за замовчуванням',
  'settings.detectedHardware': 'Виявлене обладнання',
  'settings.devicesAreAutoDetected': 'Пристрої виявляються автоматично. Зміни застосовуються в реальному часі.',
  'settings.disconnected': 'Відключено',
  'settings.doNotDisturb': 'Не турбувати',
  'settings.doNotDisturbDesc': 'Приховати всі сповіщення',
  'settings.doYouLikeAsgard': 'Вам подобається додаток Asgard?',
  'settings.donationIn': 'Зробити внесок',
  'settings.enableNotifications': 'Увімкнути сповіщення',
  'settings.enableNotificationsDesc': 'Показувати сповіщення Windows для нових повідомлень',
  'settings.enableRelay': 'Увімкнути ретрансляцію',
  'settings.enableRelayDesc': 'Використовувати сліпі ретранслятори, коли прямі з\'єднання недоступні',
  'settings.exportData': 'Експортувати дані',
  'settings.flushDht': 'Очистити DHT',
  'settings.grantPermission': 'Надати дозвіл',
  'settings.grantPermissionDesc': 'Надайте дозвіл для перегляду назв пристроїв та налаштування обладнання.',
  'settings.hideRecoveryPhrase': 'Приховати фразу відновлення',
  'settings.highContrast': 'Висока контрастність',
  'settings.highContrastDesc': 'Збільшити контрастність для кращої видимості',
  'settings.importData': 'Імпортувати дані',
  'settings.inlinePreviews': 'Вбудовані попередні перегляди',
  'settings.inlinePreviewsDesc': 'Показувати попередні перегляди зображень безпосередньо в чаті',
  'settings.kbPerSecond': 'КБ/с',
  'settings.keyboardNavigation': 'Навігація клавіатурою',
  'settings.keyboardNavigationDesc': 'Показувати комбінації клавіш та індикатори фокусу',
  'settings.largerTouchTargets': 'Більші сенсорні цілі',
  'settings.largerTouchTargetsDesc': 'Зробити кнопки та інтерактивні елементи легшими для дотику',
  'settings.linkPreviews': 'Попередні перегляди посилань',
  'settings.linkPreviewsDesc': 'Автоматично отримувати та показувати попередні перегляди посилань (може розкрити вашу активність перегляду)',
  'settings.localCache': 'Локальний кеш',
  'settings.manageTrash': 'Керувати кошиком',
  'settings.maxPeers': 'Максимальна кількість пірів',
  'settings.mbLimit': 'Обмеження МБ',
  'settings.mediaSubtitle': 'Налаштуйте відтворення та стиснення медіа',
  'settings.mentionsOnly': 'Тільки згадки',
  'settings.mentionsOnlyDesc': 'Сповіщати тільки про згадки та прямі повідомлення',
  'settings.messageDensity': 'Щільність повідомлень',
  'settings.messagePreview': 'Попередній перегляд повідомлення',
  'settings.messagePreviewDesc': 'Показувати вміст повідомлення у сповіщеннях',
  'settings.microphone': 'Мікрофон',
  'settings.microphoneAccess': 'Доступ до мікрофона та камери',
  'settings.microphoneUpdated': 'Мікрофон оновлено',
  'settings.microphones': 'Мікрофони',
  'settings.muteByDefault': 'За замовчуванням вимкнено',
  'settings.muteByDefaultDesc': 'Запускати відео в беззвучному режимі',
  'settings.networkSubtitle': 'Налаштування підключення P2P',
  'settings.neverShareRecoveryPhrase': 'Ніколи не діліться своєю фразою відновлення!',
  'settings.new': 'Нове',
  'settings.notAvailable': 'Недоступно',
  'settings.notificationSoundDesc': 'Відтворювати звук для нових повідомлень',
  'settings.onlineStatus': 'Онлайн статус',
  'settings.onlineStatusDesc': 'Дозволити контактам бачити ваш онлайн статус',
  'settings.peerLatency': 'Затримка пірів',
  'settings.peerQuality': 'Якість пірів',
  'settings.peers': 'Піри',
  'settings.readReceipts': 'Підтвердження прочитання',
  'settings.readReceiptsDesc': 'Повідомляти інших, коли ви прочитали їхні повідомлення',
  'settings.recoveryPhrase': 'Фраза відновлення',
  'settings.recoveryPhraseDesc': 'Ваша фраза відновлення з 24 слів може бути використана для відновлення вашої ідентичності на іншому пристрої. Зберігайте її безпечно і ніколи не діліться нею.',
  'settings.recoveryPhraseWarning': 'Будь-хто з цими словами може отримати доступ до вашого облікового запису.',
  'settings.reducedMotion': 'Зменшити анімації',
  'settings.reducedMotionDesc': 'Мінімізувати анімації та переходи',
  'settings.screenReaderOptimizations': 'Оптимізації зчитувача екрана',
  'settings.screenReaderOptimizationsDesc': 'Покращена підтримка зчитувачів екрана',
  'settings.securitySubtitle': 'Керуйте своєю ідентичністю та фразою відновлення',
  'settings.sendOnEnter': 'Надіслати клавішею Enter',
  'settings.sendOnEnterDesc': 'Натисніть Enter для надсилання, Shift+Enter для нового рядка',
  'settings.showReadStatus': 'Показувати статус прочитання',
  'settings.showReadStatusDesc': 'Показувати підтвердження прочитання на надісланих повідомленнях',
  'settings.showRecoveryPhrase': 'Показати фразу відновлення',
  'settings.showSeconds': 'Показувати секунди',
  'settings.showSecondsDesc': 'Включати секунди в часові мітки',
  'settings.showTimestamps': 'Показувати часові мітки',
  'settings.showTimestampsDesc': 'Показувати час поруч з кожним повідомленням',
  'settings.showVideoControls': 'Показувати елементи керування відео',
  'settings.showVideoControlsDesc': 'Показувати елементи керування відтворенням на відео',
  'settings.speaker': 'Динамік',
  'settings.speakerUpdated': 'Динамік оновлено',
  'settings.speakers': 'Динаміки',
  'settings.stopTest': 'Зупинити тест',
  'settings.storageSubtitle': 'Керуйте локальними даними та завантаженнями',
  'settings.suspended': 'Призупинено',
  'settings.testCamera': 'Тестувати камеру',
  'settings.testMic': 'Тестувати мікрофон',
  'settings.textToSpeech': 'Текст у мовлення',
  'settings.textToSpeechDesc': 'Читати повідомлення вголос',
  'settings.topics': 'Теми',
  'settings.tradeCryptocurrencyPrivately': 'Торгувати криптовалютами приватно',
  'settings.typingIndicators': 'Індикатори набору тексту',
  'settings.typingIndicatorsDesc': 'Дозволити іншим бачити, коли ви набираєте текст',
  'settings.usedOf': 'використано з',
  'settings.videoQuality_auto': 'Автоматична',
  'settings.videoQuality_high': 'Висока',
  'settings.videoQuality_low': 'Низька',
  'settings.videoQuality_medium': 'Середня',
  'settings.yourIdentity': 'Ваша ідентичність',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'uk') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (ukTranslations[key]) {
    const newValue = ukTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Ukrainian translations.`)
