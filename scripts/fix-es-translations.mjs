import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const esTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Subir foto',
  'avatar.cropAvatar': 'Recortar avatar',
  'avatar.cancel': 'Cancelar',
  'avatar.cropSave': 'Recortar y guardar',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Actualizar conexión del servidor',
  'calls.noContactsFound': 'No se encontraron contactos',
  'calls.startCallHint': 'Inicia una llamada desde la lista de contactos',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Recargar contactos desde almacenamiento Hyperbee',
  'contacts.displayNameOptional': 'Nombre para mostrar (opcional)',
  'contacts.displayNamePlaceholder': '¿Cómo deberían aparecer?',
  'contacts.selectContact': 'Selecciona un contacto para ver los detalles',
  'contacts.noBlockedContacts': 'No hay contactos bloqueados',
  'contacts.noContactsFound': 'No se encontraron contactos',
  'contacts.error.publicKeyRequired': 'Introduce una clave pública',
  'contacts.error.invalidPublicKey': 'Formato de clave pública no válido',
  'contacts.error.noIdentity': 'No hay identidad disponible',
  'contacts.error.noContactsFound': 'No se encontraron contactos en el almacenamiento Hyperbee',
  'contacts.error.failedToReload': 'Error al recargar contactos',

  // ─── groups ───
  'groups.admins': 'Administradores',
  'groups.groups': 'Grupos',
  'groups.create': 'Crear',
  'groups.searchGroups': 'Buscar grupos…',
  'groups.noGroupsFound': 'No se encontraron grupos',
  'groups.noGroupsYet': 'Aún no hay grupos',
  'groups.createGroupHint': 'Crea un grupo para empezar a colaborar',
  'groups.createFirstGroup': 'Crea tu primer grupo',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Cancelar respuesta',
  'messageInput.attachFile': 'Adjuntar archivo',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Enviar mensaje',
  'messageInput.dropFiles': 'Suelta archivos aquí',
  'messageInput.replyingTo': 'Respondiendo a',
  'messageInput.messageDeleted': 'Mensaje eliminado',

  // ─── modal ───
  'modal.addContact': 'Añadir contacto',
  'modal.publicKey': 'Clave pública',
  'modal.publicKeyPlaceholder': 'Introduce la clave pública del contacto…',
  'modal.displayName': 'Nombre para mostrar (opcional)',
  'modal.displayNamePlaceholder': 'Dale un nombre a este contacto…',
  'modal.cancel': 'Cancelar',
  'modal.add': 'Añadir',
  'modal.shareKey': 'Comparte tu clave pública con tu contacto para que también pueda añadirte. La encuentras en Ajustes → Perfil.',
  'modal.error.publicKeyRequired': 'La clave pública es obligatoria',
  'modal.error.publicKeyTooShort': 'La clave pública es demasiado corta',
  'modal.error.contactExists': 'El contacto ya existe',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimizar',
  'titlebar.maximize': 'Maximizar',
  'titlebar.close': 'Cerrar',

  // ─── toast ───
  'toast.dismiss': 'Cerrar',
  'toast.dataImported': 'Datos importados correctamente',
  'toast.importFailed': 'Error al importar',
  'toast.invalidBackupFile': 'Archivo de copia de seguridad no válido',
  'toast.cacheCleared': 'Caché vaciada',
  'toast.failedToClearCache': 'Error al vaciar la caché',
  'toast.permissionGranted': 'Permiso concedido',
  'toast.permissionDenied': 'Permiso denegado',
  'toast.microphoneUpdated': 'Micrófono actualizado',
  'toast.cameraUpdated': 'Cámara actualizada',
  'toast.speakerUpdated': 'Altavoz actualizado',
  'toast.cameraTestFailed': 'Error en la prueba de cámara',
  'toast.addressCopied': 'Dirección copiada al portapapeles',
  'toast.failedToCopyAddress': 'Error al copiar la dirección',
  'toast.contactAdded': 'Contacto añadido — descubrimiento iniciado',
  'toast.failedToAddContact': 'Error al añadir el contacto',

  // ─── settings ───
  'settings.audio': 'Audio',
  'settings.fileType_audio': 'Audio',
  'settings.profile': 'Perfil',
  'settings.appVersion': 'Versión {{version}}',
  'settings.accessibilitySubtitle': 'Haz Asgard más accesible para ti',
  'settings.atTheFollowingAddress': 'en la siguiente dirección:',
  'settings.audioQuality_high': 'Alta',
  'settings.audioQuality_low': 'Baja',
  'settings.audioQuality_medium': 'Media',
  'settings.autoDownload': 'Descarga automática',
  'settings.autoDownloadAudioDesc': 'Descargar mensajes de audio automáticamente',
  'settings.autoDownloadImagesDesc': 'Descargar imágenes automáticamente',
  'settings.autoDownloadVideosDesc': 'Descargar vídeos automáticamente',
  'settings.autoEmoji': 'Emojis automáticos',
  'settings.autoEmojiDesc': 'Convertir atajos de texto como :) en emojis',
  'settings.autoPlayGifs': 'Reproducir GIFs automáticamente',
  'settings.autoPlayGifsDesc': 'Animar imágenes GIF automáticamente',
  'settings.autoPlayVideos': 'Reproducir vídeos automáticamente',
  'settings.autoPlayVideosDesc': 'Reproducir vídeos automáticamente cuando sean visibles',
  'settings.bandwidth': 'Ancho de banda',
  'settings.batterySaver': 'Ahorro de batería',
  'settings.batterySaverDesc': 'Suspender P2P cuando la app está en segundo plano',
  'settings.builtWith': 'Construido con: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Cámara',
  'settings.cameraTestFailed': 'Error en la prueba de cámara',
  'settings.cameraUpdated': 'Cámara actualizada',
  'settings.cameras': 'Cámaras',
  'settings.chatDensity_comfortable': 'Cómodo',
  'settings.chatDensity_compact': 'Compacto',
  'settings.chatDensity_cozy': 'Cómodo',
  'settings.chatSubtitle': 'Configura tu experiencia de mensajería',
  'settings.clearCache': 'Vaciar caché',
  'settings.clickToCopy': 'Haz clic para copiar',
  'settings.collapseMessages': 'Contraer mensajes',
  'settings.collapseMessagesDesc': 'Agrupar mensajes consecutivos del mismo remitente',
  'settings.compressImages': 'Comprimir imágenes',
  'settings.compressImagesDesc': 'Comprimir imágenes antes de enviar',
  'settings.compressVideos': 'Comprimir vídeos',
  'settings.compressVideosDesc': 'Comprimir vídeos antes de enviar para reducir el uso de datos',
  'settings.connected': 'Conectado',
  'settings.connecting': 'Conectando',
  'settings.connectionStatus': 'Estado de la conexión',
  'settings.copied': '¡Copiado!',
  'settings.copyToClipboard': 'Copiar al portapapeles',
  'settings.defaultAudioQuality': 'Calidad de audio predeterminada',
  'settings.defaultSpeaker': 'Altavoz predeterminado',
  'settings.defaultVideoQuality': 'Calidad de vídeo predeterminada',
  'settings.detectedHardware': 'Hardware detectado',
  'settings.devicesAreAutoDetected': 'Los dispositivos se detectan automáticamente. Los cambios se aplican en tiempo real.',
  'settings.disconnected': 'Desconectado',
  'settings.doNotDisturb': 'No molestar',
  'settings.doNotDisturbDesc': 'Suprimir todas las notificaciones',
  'settings.doYouLikeAsgard': '¿Te gusta la app Asgard?',
  'settings.donationIn': 'Donar en',
  'settings.enableNotifications': 'Activar notificaciones',
  'settings.enableNotificationsDesc': 'Mostrar notificaciones de Windows para nuevos mensajes',
  'settings.enableRelay': 'Activar relé',
  'settings.enableRelayDesc': 'Usar relés ciegos cuando las conexiones directas no estén disponibles',
  'settings.exportData': 'Exportar datos',
  'settings.flushDht': 'Vaciar DHT',
  'settings.grantPermission': 'Conceder permiso',
  'settings.grantPermissionDesc': 'Concede permiso para ver los nombres de los dispositivos y configurar tu hardware.',
  'settings.hideRecoveryPhrase': 'Ocultar frase de recuperación',
  'settings.highContrast': 'Alto contraste',
  'settings.highContrastDesc': 'Aumentar el contraste para mejor visibilidad',
  'settings.importData': 'Importar datos',
  'settings.inlinePreviews': 'Vistas previas integradas',
  'settings.inlinePreviewsDesc': 'Mostrar vistas previas de imágenes directamente en el chat',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Navegación por teclado',
  'settings.keyboardNavigationDesc': 'Mostrar atajos de teclado e indicadores de enfoque',
  'settings.largerTouchTargets': 'Objetos táctiles más grandes',
  'settings.largerTouchTargetsDesc': 'Hacer los botones y elementos interactivos más fáciles de tocar',
  'settings.linkPreviews': 'Vistas previas de enlaces',
  'settings.linkPreviewsDesc': 'Obtener y mostrar automáticamente vistas previas de enlaces (puede revelar tu actividad de navegación)',
  'settings.localCache': 'Caché local',
  'settings.manageTrash': 'Gestionar papelera',
  'settings.maxPeers': 'Número máximo de pares',
  'settings.mbLimit': 'Límite de MB',
  'settings.mediaSubtitle': 'Configura la reproducción y compresión de medios',
  'settings.mentionsOnly': 'Solo menciones',
  'settings.mentionsOnlyDesc': 'Notificar solo para menciones y mensajes directos',
  'settings.messageDensity': 'Densidad de mensajes',
  'settings.messagePreview': 'Vista previa del mensaje',
  'settings.messagePreviewDesc': 'Mostrar el contenido del mensaje en las notificaciones',
  'settings.microphone': 'Micrófono',
  'settings.microphoneAccess': 'Acceso a micrófono y cámara',
  'settings.microphoneUpdated': 'Micrófono actualizado',
  'settings.microphones': 'Micrófonos',
  'settings.muteByDefault': 'Silenciar por defecto',
  'settings.muteByDefaultDesc': 'Iniciar vídeos en modo silencio',
  'settings.networkSubtitle': 'Configuración de conexión P2P',
  'settings.neverShareRecoveryPhrase': '¡Nunca compartas tu frase de recuperación!',
  'settings.new': 'Nuevo',
  'settings.notAvailable': 'No disponible',
  'settings.notificationSoundDesc': 'Reproducir un sonido para nuevos mensajes',
  'settings.onlineStatus': 'Estado en línea',
  'settings.onlineStatusDesc': 'Permitir que tus contactos vean tu estado en línea',
  'settings.peerLatency': 'Latencia de pares',
  'settings.peerQuality': 'Calidad de pares',
  'settings.peers': 'Pares',
  'settings.readReceipts': 'Confirmaciones de lectura',
  'settings.readReceiptsDesc': 'Informar a otros cuando hayas leído sus mensajes',
  'settings.recoveryPhrase': 'Frase de recuperación',
  'settings.recoveryPhraseDesc': 'Tu frase de recuperación de 24 palabras puede usarse para restaurar tu identidad en otro dispositivo. Guárdala de forma segura y nunca la compartas.',
  'settings.recoveryPhraseWarning': 'Cualquiera con estas palabras puede acceder a tu cuenta.',
  'settings.reducedMotion': 'Reducir animaciones',
  'settings.reducedMotionDesc': 'Minimizar animaciones y transiciones',
  'settings.screenReaderOptimizations': 'Optimizaciones para lector de pantalla',
  'settings.screenReaderOptimizationsDesc': 'Soporte mejorado para lectores de pantalla',
  'settings.securitySubtitle': 'Gestiona tu identidad y frase de recuperación',
  'settings.sendOnEnter': 'Enviar con Enter',
  'settings.sendOnEnterDesc': 'Pulsa Enter para enviar, Mayús+Enter para nueva línea',
  'settings.showReadStatus': 'Mostrar estado de lectura',
  'settings.showReadStatusDesc': 'Mostrar confirmaciones de lectura en mensajes enviados',
  'settings.showRecoveryPhrase': 'Mostrar frase de recuperación',
  'settings.showSeconds': 'Mostrar segundos',
  'settings.showSecondsDesc': 'Incluir segundos en las marcas de tiempo',
  'settings.showTimestamps': 'Mostrar marcas de tiempo',
  'settings.showTimestampsDesc': 'Mostrar la hora junto a cada mensaje',
  'settings.showVideoControls': 'Mostrar controles de vídeo',
  'settings.showVideoControlsDesc': 'Mostrar comandos de reproducción en los vídeos',
  'settings.speaker': 'Altavoz',
  'settings.speakerUpdated': 'Altavoz actualizado',
  'settings.speakers': 'Altavoces',
  'settings.stopTest': 'Detener prueba',
  'settings.storageSubtitle': 'Gestiona datos locales y descargas',
  'settings.suspended': 'Suspendido',
  'settings.testCamera': 'Probar cámara',
  'settings.testMic': 'Probar micrófono',
  'settings.textToSpeech': 'Texto a voz',
  'settings.textToSpeechDesc': 'Leer mensajes en voz alta',
  'settings.topics': 'Temas',
  'settings.tradeCryptocurrencyPrivately': 'Comerciar criptomonedas en privado',
  'settings.typingIndicators': 'Indicadores de escritura',
  'settings.typingIndicatorsDesc': 'Permitir que otros vean cuando estás escribiendo',
  'settings.usedOf': 'usado de',
  'settings.videoQuality_auto': 'Automático',
  'settings.videoQuality_high': 'Alta',
  'settings.videoQuality_low': 'Baja',
  'settings.videoQuality_medium': 'Media',
  'settings.yourIdentity': 'Tu identidad',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'es') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (esTranslations[key]) {
    const newValue = esTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Spanish translations.`)
