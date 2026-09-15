/**
 * Add file transfer widget translations for all 25 languages
 * Run: node scripts/add-transfer-translations.mjs
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
    'chat.sendingFile': 'Sending file',
    'chat.receivingFile': 'Receiving file',
    'chat.transfersActive': '{{count}} transfers active',
    'chat.sending': 'Sending',
  },
  fr: {
    'chat.sendingFile': 'Envoi du fichier',
    'chat.receivingFile': 'Réception du fichier',
    'chat.transfersActive': '{{count}} transferts en cours',
    'chat.sending': 'Envoi',
  },
  de: {
    'chat.sendingFile': 'Datei wird gesendet',
    'chat.receivingFile': 'Datei wird empfangen',
    'chat.transfersActive': '{{count}} Übertragungen aktiv',
    'chat.sending': 'Senden',
  },
  es: {
    'chat.sendingFile': 'Enviando archivo',
    'chat.receivingFile': 'Recibiendo archivo',
    'chat.transfersActive': '{{count}} transferencias activas',
    'chat.sending': 'Enviando',
  },
  it: {
    'chat.sendingFile': 'Invio file',
    'chat.receivingFile': 'Ricezione file',
    'chat.transfersActive': '{{count}} trasferimenti attivi',
    'chat.sending': 'Invio',
  },
  pt: {
    'chat.sendingFile': 'Enviando ficheiro',
    'chat.receivingFile': 'A receber ficheiro',
    'chat.transfersActive': '{{count}} transferências ativas',
    'chat.sending': 'Enviando',
  },
  nl: {
    'chat.sendingFile': 'Bestand verzenden',
    'chat.receivingFile': 'Bestand ontvangen',
    'chat.transfersActive': '{{count}} overdrachten actief',
    'chat.sending': 'Verzenden',
  },
  ru: {
    'chat.sendingFile': 'Отправка файла',
    'chat.receivingFile': 'Получение файла',
    'chat.transfersActive': '{{count}} передач активно',
    'chat.sending': 'Отправка',
  },
  zh: {
    'chat.sendingFile': '发送文件',
    'chat.receivingFile': '接收文件',
    'chat.transfersActive': '{{count}} 个传输进行中',
    'chat.sending': '发送中',
  },
  ja: {
    'chat.sendingFile': 'ファイル送信中',
    'chat.receivingFile': 'ファイル受信中',
    'chat.transfersActive': '{{count}} 件の転送が進行中',
    'chat.sending': '送信中',
  },
  ko: {
    'chat.sendingFile': '파일 전송 중',
    'chat.receivingFile': '파일 수신 중',
    'chat.transfersActive': '{{count}}개 전송 활성',
    'chat.sending': '전송 중',
  },
  ar: {
    'chat.sendingFile': 'إرسال الملف',
    'chat.receivingFile': 'استقبال الملف',
    'chat.transfersActive': '{{count}} نقل نشط',
    'chat.sending': 'إرسال',
  },
  hi: {
    'chat.sendingFile': 'फ़ाइल भेज रहे हैं',
    'chat.receivingFile': 'फ़ाइल प्राप्त हो रही है',
    'chat.transfersActive': '{{count}} स्थानांतरण सक्रिय',
    'chat.sending': 'भेज रहे हैं',
  },
  tr: {
    'chat.sendingFile': 'Dosya gönderiliyor',
    'chat.receivingFile': 'Dosya alınıyor',
    'chat.transfersActive': '{{count}} aktarma aktif',
    'chat.sending': 'Gönderiliyor',
  },
  pl: {
    'chat.sendingFile': 'Wysyłanie pliku',
    'chat.receivingFile': 'Odbieranie pliku',
    'chat.transfersActive': '{{count}} transferów aktywnych',
    'chat.sending': 'Wysyłanie',
  },
  sv: {
    'chat.sendingFile': 'Skickar fil',
    'chat.receivingFile': 'Tar emot fil',
    'chat.transfersActive': '{{count}} överföringar aktiva',
    'chat.sending': 'Skickar',
  },
  da: {
    'chat.sendingFile': 'Sender fil',
    'chat.receivingFile': 'Modtager fil',
    'chat.transfersActive': '{{count}} overførsler aktive',
    'chat.sending': 'Sender',
  },
  no: {
    'chat.sendingFile': 'Sender fil',
    'chat.receivingFile': 'Mottar fil',
    'chat.transfersActive': '{{count}} overføringer aktive',
    'chat.sending': 'Sender',
  },
  fi: {
    'chat.sendingFile': 'Lähetetään tiedostoa',
    'chat.receivingFile': 'Vastaanotetaan tiedostoa',
    'chat.transfersActive': '{{count}} siirtoa aktiivisena',
    'chat.sending': 'Lähetetään',
  },
  cs: {
    'chat.sendingFile': 'Odesílání souboru',
    'chat.receivingFile': 'Přijímání souboru',
    'chat.transfersActive': '{{count}} přenosů aktivních',
    'chat.sending': 'Odesílání',
  },
  bg: {
    'chat.sendingFile': 'Изпращане на файл',
    'chat.receivingFile': 'Получаване на файл',
    'chat.transfersActive': '{{count}} предавания активни',
    'chat.sending': 'Изпращане',
  },
  ga: {
    'chat.sendingFile': 'Comhad á sheoladh',
    'chat.receivingFile': 'Comhad á fháil',
    'chat.transfersActive': '{{count}} aistrithe gníomhach',
    'chat.sending': 'Á sheoladh',
  },
  ro: {
    'chat.sendingFile': 'Se trimite fișierul',
    'chat.receivingFile': 'Se primește fișierul',
    'chat.transfersActive': '{{count}} transferuri active',
    'chat.sending': 'Se trimite',
  },
  uk: {
    'chat.sendingFile': 'Надсилання файлу',
    'chat.receivingFile': 'Отримання файлу',
    'chat.transfersActive': '{{count}} передач активно',
    'chat.sending': 'Надсилання',
  },
}

// Read the translations file
let content = fs.readFileSync(translationsPath, 'utf-8')
const lines = content.split('\n')

let totalAdded = 0
let langIndex = 0
const langOrder = Object.keys(newTranslations)

// Process line by line - find "chat.receiving" entries and add after them
let i = 0
while (i < lines.length) {
  const line = lines[i]
  
  // Check if this line contains "chat.receiving" - good insertion point
  if (line.includes('"chat.receiving"')) {
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
