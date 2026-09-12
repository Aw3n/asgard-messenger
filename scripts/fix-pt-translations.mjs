import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const ptTranslations = {
  // ─── avatar ───
  'avatar.uploadPhoto': 'Carregar foto',
  'avatar.cropAvatar': 'Cortar avatar',
  'avatar.cancel': 'Cancelar',
  'avatar.cropSave': 'Cortar e guardar',

  // ─── calls ───
  'calls.openChat': 'Chat',
  'calls.refreshServer': 'Atualizar ligação ao servidor',
  'calls.noContactsFound': 'Nenhum contacto encontrado',
  'calls.startCallHint': 'Inicia uma chamada a partir da lista de contactos',

  // ─── common ───
  'common.admin': 'Admin',

  // ─── contacts ───
  'contacts.reloadContacts': 'Recarregar contactos do armazenamento Hyperbee',
  'contacts.displayNameOptional': 'Nome a exibir (opcional)',
  'contacts.displayNamePlaceholder': 'Como devem aparecer?',
  'contacts.selectContact': 'Seleciona um contacto para ver os detalhes',
  'contacts.noBlockedContacts': 'Nenhum contacto bloqueado',
  'contacts.noContactsFound': 'Nenhum contacto encontrado',
  'contacts.error.publicKeyRequired': 'Introduz uma chave pública',
  'contacts.error.invalidPublicKey': 'Formato de chave pública inválido',
  'contacts.error.noIdentity': 'Nenhuma identidade disponível',
  'contacts.error.noContactsFound': 'Nenhum contacto encontrado no armazenamento Hyperbee',
  'contacts.error.failedToReload': 'Falha ao recarregar contactos',

  // ─── groups ───
  'groups.admins': 'Administradores',
  'groups.groups': 'Grupos',
  'groups.create': 'Criar',
  'groups.searchGroups': 'Procurar grupos…',
  'groups.noGroupsFound': 'Nenhum grupo encontrado',
  'groups.noGroupsYet': 'Ainda sem grupos',
  'groups.createGroupHint': 'Cria um grupo para começar a colaborar',
  'groups.createFirstGroup': 'Cria o teu primeiro grupo',

  // ─── messageInput ───
  'messageInput.cancelReply': 'Cancelar resposta',
  'messageInput.attachFile': 'Anexar ficheiro',
  'messageInput.emoji': 'Emoji',
  'messageInput.send': 'Enviar mensagem',
  'messageInput.dropFiles': 'Larga ficheiros aqui',
  'messageInput.replyingTo': 'A responder a',
  'messageInput.messageDeleted': 'Mensagem eliminada',

  // ─── modal ───
  'modal.addContact': 'Adicionar contacto',
  'modal.publicKey': 'Chave pública',
  'modal.publicKeyPlaceholder': 'Introduz a chave pública do contacto…',
  'modal.displayName': 'Nome a exibir (opcional)',
  'modal.displayNamePlaceholder': 'Dá um nome a este contacto…',
  'modal.cancel': 'Cancelar',
  'modal.add': 'Adicionar',
  'modal.shareKey': 'Partilha a tua chave pública com o teu contacto para que também te possa adicionar. Encontra-a em Definições → Perfil.',
  'modal.error.publicKeyRequired': 'A chave pública é obrigatória',
  'modal.error.publicKeyTooShort': 'A chave pública é demasiado curta',
  'modal.error.contactExists': 'O contacto já existe',

  // ─── panels ───
  'panels.info': 'Info',

  // ─── titlebar ───
  'titlebar.minimize': 'Minimizar',
  'titlebar.maximize': 'Maximizar',
  'titlebar.close': 'Fechar',

  // ─── toast ───
  'toast.dismiss': 'Fechar',
  'toast.dataImported': 'Dados importados com sucesso',
  'toast.importFailed': 'Falha na importação',
  'toast.invalidBackupFile': 'Ficheiro de cópia de segurança inválido',
  'toast.cacheCleared': 'Cache limpa',
  'toast.failedToClearCache': 'Falha ao limpar a cache',
  'toast.permissionGranted': 'Permissão concedida',
  'toast.permissionDenied': 'Permissão negada',
  'toast.microphoneUpdated': 'Microfone atualizado',
  'toast.cameraUpdated': 'Câmara atualizada',
  'toast.speakerUpdated': 'Coluna atualizada',
  'toast.cameraTestFailed': 'Falha no teste da câmara',
  'toast.addressCopied': 'Endereço copiado para a área de transferência',
  'toast.failedToCopyAddress': 'Falha ao copiar o endereço',
  'toast.contactAdded': 'Contacto adicionado — deteção iniciada',
  'toast.failedToAddContact': 'Falha ao adicionar o contacto',

  // ─── settings ───
  'settings.audio': 'Áudio',
  'settings.fileType_audio': 'Áudio',
  'settings.profile': 'Perfil',
  'settings.appVersion': 'Versão {{version}}',
  'settings.accessibilitySubtitle': 'Torna o Asgard mais acessível para ti',
  'settings.atTheFollowingAddress': 'no seguinte endereço:',
  'settings.audioQuality_high': 'Alta',
  'settings.audioQuality_low': 'Baixa',
  'settings.audioQuality_medium': 'Média',
  'settings.autoDownload': 'Transferência automática',
  'settings.autoDownloadAudioDesc': 'Transferir mensagens de áudio automaticamente',
  'settings.autoDownloadImagesDesc': 'Transferir imagens automaticamente',
  'settings.autoDownloadVideosDesc': 'Transferir vídeos automaticamente',
  'settings.autoEmoji': 'Emojis automáticos',
  'settings.autoEmojiDesc': 'Converter atalhos de texto como :) em emojis',
  'settings.autoPlayGifs': 'Reproduzir GIFs automaticamente',
  'settings.autoPlayGifsDesc': 'Animar imagens GIF automaticamente',
  'settings.autoPlayVideos': 'Reproduzir vídeos automaticamente',
  'settings.autoPlayVideosDesc': 'Reproduzir vídeos automaticamente quando visíveis',
  'settings.bandwidth': 'Largura de banda',
  'settings.batterySaver': 'Poupança de bateria',
  'settings.batterySaverDesc': 'Suspender P2P quando a app está em segundo plano',
  'settings.builtWith': 'Construído com: Electron, React, TypeScript, Hyperswarm',
  'settings.camera': 'Câmara',
  'settings.cameraTestFailed': 'Falha no teste da câmara',
  'settings.cameraUpdated': 'Câmara atualizada',
  'settings.cameras': 'Câmaras',
  'settings.chatDensity_comfortable': 'Confortável',
  'settings.chatDensity_compact': 'Compacto',
  'settings.chatDensity_cozy': 'Confortável',
  'settings.chatSubtitle': 'Configura a tua experiência de mensagens',
  'settings.clearCache': 'Limpar cache',
  'settings.clickToCopy': 'Clica para copiar',
  'settings.collapseMessages': 'Comprimir mensagens',
  'settings.collapseMessagesDesc': 'Agrupar mensagens consecutivas do mesmo remetente',
  'settings.compressImages': 'Comprimir imagens',
  'settings.compressImagesDesc': 'Comprimir imagens antes de enviar',
  'settings.compressVideos': 'Comprimir vídeos',
  'settings.compressVideosDesc': 'Comprimir vídeos antes de enviar para reduzir o uso de dados',
  'settings.connected': 'Ligado',
  'settings.connecting': 'A ligar',
  'settings.connectionStatus': 'Estado da ligação',
  'settings.copied': 'Copiado!',
  'settings.copyToClipboard': 'Copiar para a área de transferência',
  'settings.defaultAudioQuality': 'Qualidade de áudio predefinida',
  'settings.defaultSpeaker': 'Coluna predefinida',
  'settings.defaultVideoQuality': 'Qualidade de vídeo predefinida',
  'settings.detectedHardware': 'Hardware detetado',
  'settings.devicesAreAutoDetected': 'Os dispositivos são detetados automaticamente. As alterações são aplicadas em tempo real.',
  'settings.disconnected': 'Desligado',
  'settings.doNotDisturb': 'Não incomodar',
  'settings.doNotDisturbDesc': 'Suprimir todas as notificações',
  'settings.doYouLikeAsgard': 'Gostas da app Asgard?',
  'settings.donationIn': 'Doar em',
  'settings.enableNotifications': 'Ativar notificações',
  'settings.enableNotificationsDesc': 'Mostrar notificações do Windows para novas mensagens',
  'settings.enableRelay': 'Ativar relé',
  'settings.enableRelayDesc': 'Usar relés cegos quando as ligações diretas não estão disponíveis',
  'settings.exportData': 'Exportar dados',
  'settings.flushDht': 'Esvaziar DHT',
  'settings.grantPermission': 'Conceder permissão',
  'settings.grantPermissionDesc': 'Concede permissão para ver os nomes dos dispositivos e configurar o teu hardware.',
  'settings.hideRecoveryPhrase': 'Ocultar frase de recuperação',
  'settings.highContrast': 'Alto contraste',
  'settings.highContrastDesc': 'Aumentar o contraste para melhor visibilidade',
  'settings.importData': 'Importar dados',
  'settings.inlinePreviews': 'Pré-visualizações integradas',
  'settings.inlinePreviewsDesc': 'Mostrar pré-visualizações de imagens diretamente no chat',
  'settings.kbPerSecond': 'KB/s',
  'settings.keyboardNavigation': 'Navegação por teclado',
  'settings.keyboardNavigationDesc': 'Mostrar atalhos de teclado e indicadores de foco',
  'settings.largerTouchTargets': 'Alvos táteis maiores',
  'settings.largerTouchTargetsDesc': 'Tornar os botões e elementos interativos mais fáceis de tocar',
  'settings.linkPreviews': 'Pré-visualizações de ligações',
  'settings.linkPreviewsDesc': 'Obter e mostrar automaticamente pré-visualizações de ligações (pode revelar a tua atividade de navegação)',
  'settings.localCache': 'Cache local',
  'settings.manageTrash': 'Gerir reciclagem',
  'settings.maxPeers': 'Número máximo de pares',
  'settings.mbLimit': 'Limite de MB',
  'settings.mediaSubtitle': 'Configura a reprodução e compressão de média',
  'settings.mentionsOnly': 'Apenas menções',
  'settings.mentionsOnlyDesc': 'Notificar apenas para menções e mensagens diretas',
  'settings.messageDensity': 'Densidade de mensagens',
  'settings.messagePreview': 'Pré-visualização da mensagem',
  'settings.messagePreviewDesc': 'Mostrar o conteúdo da mensagem nas notificações',
  'settings.microphone': 'Microfone',
  'settings.microphoneAccess': 'Acesso ao microfone e câmara',
  'settings.microphoneUpdated': 'Microfone atualizado',
  'settings.microphones': 'Microfones',
  'settings.muteByDefault': 'Silenciar por predefinição',
  'settings.muteByDefaultDesc': 'Iniciar vídeos em modo silencioso',
  'settings.networkSubtitle': 'Configurações de ligação P2P',
  'settings.neverShareRecoveryPhrase': 'Nunca partilhes a tua frase de recuperação!',
  'settings.new': 'Novo',
  'settings.notAvailable': 'Não disponível',
  'settings.notificationSoundDesc': 'Reproduzir um som para novas mensagens',
  'settings.onlineStatus': 'Estado online',
  'settings.onlineStatusDesc': 'Permitir que os teus contactos vejam o teu estado online',
  'settings.peerLatency': 'Latência dos pares',
  'settings.peerQuality': 'Qualidade dos pares',
  'settings.peers': 'Pares',
  'settings.readReceipts': 'Confirmações de leitura',
  'settings.readReceiptsDesc': 'Informar os outros quando leste as suas mensagens',
  'settings.recoveryPhrase': 'Frase de recuperação',
  'settings.recoveryPhraseDesc': 'A tua frase de recuperação de 24 palavras pode ser usada para restaurar a tua identidade noutro dispositivo. Guarda-a em segurança e nunca a partilhes.',
  'settings.recoveryPhraseWarning': 'Qualquer pessoa com estas palavras pode aceder à tua conta.',
  'settings.reducedMotion': 'Reduzir animações',
  'settings.reducedMotionDesc': 'Minimizar animações e transições',
  'settings.screenReaderOptimizations': 'Otimizações para leitor de ecrã',
  'settings.screenReaderOptimizationsDesc': 'Suporte melhorado para leitores de ecrã',
  'settings.securitySubtitle': 'Gere a tua identidade e frase de recuperação',
  'settings.sendOnEnter': 'Enviar com Enter',
  'settings.sendOnEnterDesc': 'Prime Enter para enviar, Shift+Enter para nova linha',
  'settings.showReadStatus': 'Mostrar estado de leitura',
  'settings.showReadStatusDesc': 'Mostrar confirmações de leitura nas mensagens enviadas',
  'settings.showRecoveryPhrase': 'Mostrar frase de recuperação',
  'settings.showSeconds': 'Mostrar segundos',
  'settings.showSecondsDesc': 'Incluir segundos nas marcas de tempo',
  'settings.showTimestamps': 'Mostrar marcas de tempo',
  'settings.showTimestampsDesc': 'Mostrar a hora ao lado de cada mensagem',
  'settings.showVideoControls': 'Mostrar controlos de vídeo',
  'settings.showVideoControlsDesc': 'Mostrar comandos de reprodução nos vídeos',
  'settings.speaker': 'Coluna',
  'settings.speakerUpdated': 'Coluna atualizada',
  'settings.speakers': 'Colunas',
  'settings.stopTest': 'Parar teste',
  'settings.storageSubtitle': 'Gere dados locais e transferências',
  'settings.suspended': 'Suspenso',
  'settings.testCamera': 'Testar câmara',
  'settings.testMic': 'Testar microfone',
  'settings.textToSpeech': 'Texto para voz',
  'settings.textToSpeechDesc': 'Ler mensagens em voz alta',
  'settings.topics': 'Tópicos',
  'settings.tradeCryptocurrencyPrivately': 'Negociar criptomoedas em privado',
  'settings.typingIndicators': 'Indicadores de escrita',
  'settings.typingIndicatorsDesc': 'Permitir que outros vejam quando estás a escrever',
  'settings.usedOf': 'usado de',
  'settings.videoQuality_auto': 'Automático',
  'settings.videoQuality_high': 'Alta',
  'settings.videoQuality_low': 'Baixa',
  'settings.videoQuality_medium': 'Média',
  'settings.yourIdentity': 'A tua identidade',
}

// ── Apply ──
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let changesCount = 0

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; continue }
  if (currentLang !== 'pt') continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (!keyMatch) continue
  const [, indent, key, oldValue, comma] = keyMatch
  if (ptTranslations[key]) {
    const newValue = ptTranslations[key].replace(/(?<!\\)"/g, '\\"')
    if (oldValue !== newValue) {
      lines[i] = `${indent}"${key}": "${newValue}"${comma}`
      changesCount++
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log(`Updated ${changesCount} Portuguese translations.`)
