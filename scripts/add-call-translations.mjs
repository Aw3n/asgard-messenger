/**
 * Add new call UI translations for all 25 languages - Fixed version
 * Run: node scripts/add-call-translations.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const translationsPath = path.join(__dirname, '..', 'src', 'i18n', 'translations.ts')

// New translation keys for each language
const newTranslations = {
  en: {
    'calls.holdLabel': 'Hold',
    'calls.holdCall': 'Hold call',
    'calls.resumeCall': 'Resume call',
    'calls.settingsLabel': 'Settings',
    'calls.callSettings': 'Call Settings',
    'calls.stopScreenShare': 'Stop sharing',
    'calls.videoQuality': 'Video Quality',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Medium',
    'calls.qualityLow': 'Low',
    'calls.noiseSuppression': 'Noise Suppression',
    'calls.noiseSuppressionDesc': 'Reduce background noise',
    'calls.echoCancellation': 'Echo Cancellation',
    'calls.echoCancellationDesc': 'Prevent echo feedback',
  },
  fr: {
    'calls.holdLabel': 'Attente',
    'calls.holdCall': 'Mettre en attente',
    'calls.resumeCall': 'Reprendre l\'appel',
    'calls.settingsLabel': 'Paramètres',
    'calls.callSettings': 'Paramètres d\'appel',
    'calls.stopScreenShare': 'Arrêter',
    'calls.videoQuality': 'Qualité vidéo',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Moyenne',
    'calls.qualityLow': 'Basse',
    'calls.noiseSuppression': 'Réduction du bruit',
    'calls.noiseSuppressionDesc': 'Réduire les bruits de fond',
    'calls.echoCancellation': 'Anti-écho',
    'calls.echoCancellationDesc': 'Éviter le retour audio',
  },
  de: {
    'calls.holdLabel': 'Halten',
    'calls.holdCall': 'Anruf halten',
    'calls.resumeCall': 'Anruf fortsetzen',
    'calls.settingsLabel': 'Einstellungen',
    'calls.callSettings': 'Anrufeinstellungen',
    'calls.stopScreenShare': 'Beenden',
    'calls.videoQuality': 'Videoqualität',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Mittel',
    'calls.qualityLow': 'Niedrig',
    'calls.noiseSuppression': 'Geräuschunterdrückung',
    'calls.noiseSuppressionDesc': 'Hintergrundgeräusche reduzieren',
    'calls.echoCancellation': 'Echounterdrückung',
    'calls.echoCancellationDesc': 'Echo-Rückkopplung verhindern',
  },
  es: {
    'calls.holdLabel': 'Espera',
    'calls.holdCall': 'Poner en espera',
    'calls.resumeCall': 'Reanudar llamada',
    'calls.settingsLabel': 'Ajustes',
    'calls.callSettings': 'Ajustes de llamada',
    'calls.stopScreenShare': 'Detener',
    'calls.videoQuality': 'Calidad de video',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Media',
    'calls.qualityLow': 'Baja',
    'calls.noiseSuppression': 'Reducción de ruido',
    'calls.noiseSuppressionDesc': 'Reducir ruido de fondo',
    'calls.echoCancellation': 'Cancelación de eco',
    'calls.echoCancellationDesc': 'Prevenir retroalimentación',
  },
  it: {
    'calls.holdLabel': 'Attesa',
    'calls.holdCall': 'Metti in attesa',
    'calls.resumeCall': 'Riprendi chiamata',
    'calls.settingsLabel': 'Impostazioni',
    'calls.callSettings': 'Impostazioni chiamata',
    'calls.stopScreenShare': 'Ferma',
    'calls.videoQuality': 'Qualità video',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Media',
    'calls.qualityLow': 'Bassa',
    'calls.noiseSuppression': 'Riduzione rumore',
    'calls.noiseSuppressionDesc': 'Riduci rumore di fondo',
    'calls.echoCancellation': 'Cancellazione eco',
    'calls.echoCancellationDesc': 'Previeni feedback audio',
  },
  pt: {
    'calls.holdLabel': 'Espera',
    'calls.holdCall': 'Colocar em espera',
    'calls.resumeCall': 'Retomar chamada',
    'calls.settingsLabel': 'Definições',
    'calls.callSettings': 'Definições da chamada',
    'calls.stopScreenShare': 'Parar',
    'calls.videoQuality': 'Qualidade do vídeo',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Média',
    'calls.qualityLow': 'Baixa',
    'calls.noiseSuppression': 'Redução de ruído',
    'calls.noiseSuppressionDesc': 'Reduzir ruído de fundo',
    'calls.echoCancellation': 'Cancelamento de eco',
    'calls.echoCancellationDesc': 'Prevenir feedback de áudio',
  },
  nl: {
    'calls.holdLabel': 'Wachten',
    'calls.holdCall': 'In wacht zetten',
    'calls.resumeCall': 'Gesprek hervatten',
    'calls.settingsLabel': 'Instellingen',
    'calls.callSettings': 'Gespreksinstellingen',
    'calls.stopScreenShare': 'Stoppen',
    'calls.videoQuality': 'Videokwaliteit',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Gemiddeld',
    'calls.qualityLow': 'Laag',
    'calls.noiseSuppression': 'Ruisonderdrukking',
    'calls.noiseSuppressionDesc': 'Achtergrondgeluid verminderen',
    'calls.echoCancellation': 'Echo-annulering',
    'calls.echoCancellationDesc': 'Audio-feedback voorkomen',
  },
  ru: {
    'calls.holdLabel': 'Удержание',
    'calls.holdCall': 'Поставить на удержание',
    'calls.resumeCall': 'Возобновить звонок',
    'calls.settingsLabel': 'Настройки',
    'calls.callSettings': 'Настройки звонка',
    'calls.stopScreenShare': 'Остановить',
    'calls.videoQuality': 'Качество видео',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Среднее',
    'calls.qualityLow': 'Низкое',
    'calls.noiseSuppression': 'Шумоподавление',
    'calls.noiseSuppressionDesc': 'Уменьшить фоновый шум',
    'calls.echoCancellation': 'Эхоподавление',
    'calls.echoCancellationDesc': 'Предотвратить обратную связь',
  },
  zh: {
    'calls.holdLabel': '保持',
    'calls.holdCall': '保持通话',
    'calls.resumeCall': '恢复通话',
    'calls.settingsLabel': '设置',
    'calls.callSettings': '通话设置',
    'calls.stopScreenShare': '停止',
    'calls.videoQuality': '视频质量',
    'calls.qualityHigh': '高清',
    'calls.qualityMedium': '中等',
    'calls.qualityLow': '低',
    'calls.noiseSuppression': '降噪',
    'calls.noiseSuppressionDesc': '减少背景噪音',
    'calls.echoCancellation': '回声消除',
    'calls.echoCancellationDesc': '防止音频反馈',
  },
  ja: {
    'calls.holdLabel': '保留',
    'calls.holdCall': '通話を保留',
    'calls.resumeCall': '通話を再開',
    'calls.settingsLabel': '設定',
    'calls.callSettings': '通話設定',
    'calls.stopScreenShare': '停止',
    'calls.videoQuality': '画質',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': '中',
    'calls.qualityLow': '低',
    'calls.noiseSuppression': 'ノイズ除去',
    'calls.noiseSuppressionDesc': '背景雑音を低減',
    'calls.echoCancellation': 'エコーキャンセル',
    'calls.echoCancellationDesc': '音声フィードバックを防止',
  },
  ko: {
    'calls.holdLabel': '대기',
    'calls.holdCall': '통화 대기',
    'calls.resumeCall': '통화 재개',
    'calls.settingsLabel': '설정',
    'calls.callSettings': '통화 설정',
    'calls.stopScreenShare': '중지',
    'calls.videoQuality': '비디오 품질',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': '중간',
    'calls.qualityLow': '낮음',
    'calls.noiseSuppression': '소음 제거',
    'calls.noiseSuppressionDesc': '배경 소음 감소',
    'calls.echoCancellation': '에코 제거',
    'calls.echoCancellationDesc': '오디오 피드백 방지',
  },
  ar: {
    'calls.holdLabel': 'انتظار',
    'calls.holdCall': 'وضع المكالمة في الانتظار',
    'calls.resumeCall': 'استئناف المكالمة',
    'calls.settingsLabel': 'الإعدادات',
    'calls.callSettings': 'إعدادات المكالمة',
    'calls.stopScreenShare': 'إيقاف',
    'calls.videoQuality': 'جودة الفيديو',
    'calls.qualityHigh': 'عالي',
    'calls.qualityMedium': 'متوسط',
    'calls.qualityLow': 'منخفض',
    'calls.noiseSuppression': 'تقليل الضوضاء',
    'calls.noiseSuppressionDesc': 'تقليل ضوضاء الخلفية',
    'calls.echoCancellation': 'إلغاء الصدى',
    'calls.echoCancellationDesc': 'منع تغذية الصوت',
  },
  hi: {
    'calls.holdLabel': 'होल्ड',
    'calls.holdCall': 'कॉल होल्ड करें',
    'calls.resumeCall': 'कॉल फिर से शुरू करें',
    'calls.settingsLabel': 'सेटिंग्स',
    'calls.callSettings': 'कॉल सेटिंग्स',
    'calls.stopScreenShare': 'रोकें',
    'calls.videoQuality': 'वीडियो गुणवत्ता',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'मध्यम',
    'calls.qualityLow': 'कम',
    'calls.noiseSuppression': 'शोर कम करना',
    'calls.noiseSuppressionDesc': 'पृष्ठभूमि शोर कम करें',
    'calls.echoCancellation': 'इको रद्दीकरण',
    'calls.echoCancellationDesc': 'ऑडियो फीडबैक रोकें',
  },
  tr: {
    'calls.holdLabel': 'Beklet',
    'calls.holdCall': 'Aramayı beklet',
    'calls.resumeCall': 'Aramayı devam ettir',
    'calls.settingsLabel': 'Ayarlar',
    'calls.callSettings': 'Arama Ayarları',
    'calls.stopScreenShare': 'Durdur',
    'calls.videoQuality': 'Video Kalitesi',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Orta',
    'calls.qualityLow': 'Düşük',
    'calls.noiseSuppression': 'Gürültü Azaltma',
    'calls.noiseSuppressionDesc': 'Arka plan gürültüsünü azalt',
    'calls.echoCancellation': 'Yankı İptali',
    'calls.echoCancellationDesc': 'Ses geri bildirimini önle',
  },
  pl: {
    'calls.holdLabel': 'Wstrzymaj',
    'calls.holdCall': 'Wstrzymaj połączenie',
    'calls.resumeCall': 'Wznów połączenie',
    'calls.settingsLabel': 'Ustawienia',
    'calls.callSettings': 'Ustawienia połączenia',
    'calls.stopScreenShare': 'Zatrzymaj',
    'calls.videoQuality': 'Jakość wideo',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Średnia',
    'calls.qualityLow': 'Niska',
    'calls.noiseSuppression': 'Redukcja szumów',
    'calls.noiseSuppressionDesc': 'Zmniejsz szum tła',
    'calls.echoCancellation': 'Redukcja echa',
    'calls.echoCancellationDesc': 'Zapobiegaj sprzężeniu audio',
  },
  sv: {
    'calls.holdLabel': 'Vänta',
    'calls.holdCall': 'På samtal i vänteläge',
    'calls.resumeCall': 'Återuppta samtal',
    'calls.settingsLabel': 'Inställningar',
    'calls.callSettings': 'Samtalsinställningar',
    'calls.stopScreenShare': 'Stoppa',
    'calls.videoQuality': 'Videokvalitet',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Medel',
    'calls.qualityLow': 'Låg',
    'calls.noiseSuppression': 'Brusreducering',
    'calls.noiseSuppressionDesc': 'Minska bakgrundsljud',
    'calls.echoCancellation': 'Ekodämpning',
    'calls.echoCancellationDesc': 'Förhindra ljudåterkoppling',
  },
  da: {
    'calls.holdLabel': 'Vent',
    'calls.holdCall': 'Sæt opkald på pause',
    'calls.resumeCall': 'Genoptag opkald',
    'calls.settingsLabel': 'Indstillinger',
    'calls.callSettings': 'Opkaldsindstillinger',
    'calls.stopScreenShare': 'Stop',
    'calls.videoQuality': 'Videokvalitet',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Medium',
    'calls.qualityLow': 'Lav',
    'calls.noiseSuppression': 'Støjreduktion',
    'calls.noiseSuppressionDesc': 'Reducer baggrundsstøj',
    'calls.echoCancellation': 'Echokancellering',
    'calls.echoCancellationDesc': 'Forhindr lydfeedback',
  },
  no: {
    'calls.holdLabel': 'Vent',
    'calls.holdCall': 'Sett samtale på vent',
    'calls.resumeCall': 'Gjenoppta samtale',
    'calls.settingsLabel': 'Innstillinger',
    'calls.callSettings': 'Samtaleinnstillinger',
    'calls.stopScreenShare': 'Stopp',
    'calls.videoQuality': 'Videokvalitet',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Medium',
    'calls.qualityLow': 'Lav',
    'calls.noiseSuppression': 'Støyreduksjon',
    'calls.noiseSuppressionDesc': 'Reduser bakgrunnsstøy',
    'calls.echoCancellation': 'Echokansellering',
    'calls.echoCancellationDesc': 'Forhindr lydtilbakekobling',
  },
  fi: {
    'calls.holdLabel': 'Pito',
    'calls.holdCall': 'Puhelu pitoon',
    'calls.resumeCall': 'Jatka puhelua',
    'calls.settingsLabel': 'Asetukset',
    'calls.callSettings': 'Puheluasetukset',
    'calls.stopScreenShare': 'Lopeta',
    'calls.videoQuality': 'Videon laatu',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Keskitaso',
    'calls.qualityLow': 'Matala',
    'calls.noiseSuppression': 'Kohinanvaimennus',
    'calls.noiseSuppressionDesc': 'Vähennä taustakohinaa',
    'calls.echoCancellation': 'Kaikunesto',
    'calls.echoCancellationDesc': 'Estä äänipalaute',
  },
  cs: {
    'calls.holdLabel': 'Podržet',
    'calls.holdCall': 'Podržet hovor',
    'calls.resumeCall': 'Obnovit hovor',
    'calls.settingsLabel': 'Nastavení',
    'calls.callSettings': 'Nastavení hovoru',
    'calls.stopScreenShare': 'Zastavit',
    'calls.videoQuality': 'Kvalita videa',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Střední',
    'calls.qualityLow': 'Nízká',
    'calls.noiseSuppression': 'Potlačení hluku',
    'calls.noiseSuppressionDesc': 'Snížit hluk na pozadí',
    'calls.echoCancellation': 'Potlačení ozvěny',
    'calls.echoCancellationDesc': 'Zabránit zpětné vazbě',
  },
  bg: {
    'calls.holdLabel': 'Задържане',
    'calls.holdCall': 'Задържане на обаждането',
    'calls.resumeCall': 'Възобновяване',
    'calls.settingsLabel': 'Настройки',
    'calls.callSettings': 'Настройки на обаждането',
    'calls.stopScreenShare': 'Спри',
    'calls.videoQuality': 'Качество на видеото',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Средно',
    'calls.qualityLow': 'Ниско',
    'calls.noiseSuppression': 'Шумоподтискане',
    'calls.noiseSuppressionDesc': 'Намаляване на фоновия шум',
    'calls.echoCancellation': 'Ехопотискане',
    'calls.echoCancellationDesc': 'Предотвратяване на обратна връзка',
  },
  ga: {
    'calls.holdLabel': 'Coinnigh',
    'calls.holdCall': 'Coinnigh an glao',
    'calls.resumeCall': 'Athdhúisigh an glao',
    'calls.settingsLabel': 'Socruithe',
    'calls.callSettings': 'Socruithe Glao',
    'calls.stopScreenShare': 'Stad',
    'calls.videoQuality': 'Cáilíocht Físe',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Meánach',
    'calls.qualityLow': 'Íseal',
    'calls.noiseSuppression': 'Laghdú Torainn',
    'calls.noiseSuppressionDesc': 'Laghdaigh torann cúlra',
    'calls.echoCancellation': 'Cealú Macalla',
    'calls.echoCancellationDesc': 'Cosc a chur ar athchothú fuaime',
  },
  ro: {
    'calls.holdLabel': 'Așteptare',
    'calls.holdCall': 'Pune în așteptare',
    'calls.resumeCall': 'Reia apelul',
    'calls.settingsLabel': 'Setări',
    'calls.callSettings': 'Setări apel',
    'calls.stopScreenShare': 'Oprește',
    'calls.videoQuality': 'Calitate video',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Medie',
    'calls.qualityLow': 'Scăzută',
    'calls.noiseSuppression': 'Reducere zgomot',
    'calls.noiseSuppressionDesc': 'Reduce zgomotul de fundal',
    'calls.echoCancellation': 'Anulare ecou',
    'calls.echoCancellationDesc': 'Previne feedback-ul audio',
  },
  uk: {
    'calls.holdLabel': 'Утримання',
    'calls.holdCall': 'Поставити на утримання',
    'calls.resumeCall': 'Відновити дзвінок',
    'calls.settingsLabel': 'Налаштування',
    'calls.callSettings': 'Налаштування дзвінка',
    'calls.stopScreenShare': 'Зупинити',
    'calls.videoQuality': 'Якість відео',
    'calls.qualityHigh': 'HD',
    'calls.qualityMedium': 'Середня',
    'calls.qualityLow': 'Низька',
    'calls.noiseSuppression': 'Шумозаглушення',
    'calls.noiseSuppressionDesc': 'Зменшити фоновий шум',
    'calls.echoCancellation': 'Лунаподавлення',
    'calls.echoCancellationDesc': 'Запобігти зворотному зв\'язку',
  },
}

// Read the translations file
let content = fs.readFileSync(translationsPath, 'utf-8')
const lines = content.split('\n')

let totalAdded = 0
let langIndex = 0
const langOrder = Object.keys(newTranslations)

// Process line by line
let i = 0
while (i < lines.length) {
  const line = lines[i]
  
  // Check if this line contains "calls.endCall"
  if (line.includes('"calls.endCall"')) {
    // Determine which language we're in based on order
    const currentLang = langOrder[langIndex]
    const translations = newTranslations[currentLang]
    
    if (translations) {
      // Build new entries
      const newEntries = []
      for (const [key, value] of Object.entries(translations)) {
        const escapedValue = value.replace(/'/g, "\\'")
        newEntries.push(`      "${key}": "${escapedValue}",`)
      }
      
      // Insert after current line
      lines.splice(i + 1, 0, ...newEntries)
      totalAdded += newEntries.length
      console.log(`✅ Added ${newEntries.length} translations for ${currentLang}`)
      
      // Move to next language
      langIndex++
      
      // Skip the lines we just added
      i += newEntries.length
    }
  }
  
  i++
}

// Write the updated content
content = lines.join('\n')
fs.writeFileSync(translationsPath, content, 'utf-8')
console.log(`\n✅ Successfully added ${totalAdded} new translation entries`)
console.log(`📝 File updated: ${translationsPath}`)
