#!/usr/bin/env node
/**
 * Deux messages de diagnostic encore codés en dur : les toasts du pare-feu
 * (App.tsx) et le compte rendu de rechargement des contacts (ContactsPage).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['settings.firewallManualHint', 'contacts.reloadedFromStorage']

const DATA = {
  fr: {
    'settings.firewallManualHint': 'Ouvrez les Paramètres > Réseau pour configurer le pare-feu manuellement.',
    'contacts.reloadedFromStorage': '{{total}} contacts trouvés dans Hyperbee, {{restored}} nouveaux restaurés.',
  },
  nl: {
    'settings.firewallManualHint': 'Open Instellingen > Netwerk om de firewall handmatig te configureren.',
    'contacts.reloadedFromStorage': '{{total}} contacten gevonden in Hyperbee, {{restored}} nieuwe hersteld.',
  },
  de: {
    'settings.firewallManualHint': 'Öffnen Sie Einstellungen > Netzwerk, um die Firewall manuell zu konfigurieren.',
    'contacts.reloadedFromStorage': '{{total}} Kontakte in Hyperbee gefunden, {{restored}} neue wiederhergestellt.',
  },
  it: {
    'settings.firewallManualHint': 'Apri Impostazioni > Rete per configurare il firewall manualmente.',
    'contacts.reloadedFromStorage': '{{total}} contatti trovati in Hyperbee, {{restored}} nuovi ripristinati.',
  },
  es: {
    'settings.firewallManualHint': 'Abre Ajustes > Red para configurar el cortafuegos manualmente.',
    'contacts.reloadedFromStorage': '{{total}} contactos encontrados en Hyperbee, {{restored}} nuevos restaurados.',
  },
  pt: {
    'settings.firewallManualHint': 'Abra Definições > Rede para configurar a firewall manualmente.',
    'contacts.reloadedFromStorage': '{{total}} contactos encontrados no Hyperbee, {{restored}} novos restaurados.',
  },
  el: {
    'settings.firewallManualHint': 'Ανοίξτε Ρυθμίσεις > Δίκτυο για να ρυθμίσετε το τείχος προστασίας χειροκίνητα.',
    'contacts.reloadedFromStorage': 'Βρέθηκαν {{total}} επαφές στο Hyperbee, αποκαταστάθηκαν {{restored}} νέες.',
  },
  da: {
    'settings.firewallManualHint': 'Åbn Indstillinger > Netværk for at konfigurere firewallen manuelt.',
    'contacts.reloadedFromStorage': '{{total}} kontakter fundet i Hyperbee, {{restored}} nye gendannet.',
  },
  fi: {
    'settings.firewallManualHint': 'Avaa Asetukset > Verkko ja määritä palomuuri manuaalisesti.',
    'contacts.reloadedFromStorage': 'Hyperbeestä löytyi {{total}} yhteystietoa, {{restored}} uutta palautettiin.',
  },
  sv: {
    'settings.firewallManualHint': 'Öppna Inställningar > Nätverk för att konfigurera brandväggen manuellt.',
    'contacts.reloadedFromStorage': '{{total}} kontakter hittades i Hyperbee, {{restored}} nya återställdes.',
  },
  hr: {
    'settings.firewallManualHint': 'Otvorite Postavke > Mreža da biste ručno konfigurirali vatrozid.',
    'contacts.reloadedFromStorage': 'Pronađeno {{total}} kontakata u Hyperbeeju, obnovljeno {{restored}} novih.',
  },
  et: {
    'settings.firewallManualHint': 'Avage Seaded > Võrk, et tulemüür käsitsi seadistada.',
    'contacts.reloadedFromStorage': 'Hyperbeest leiti {{total}} kontakti, taastati {{restored}} uut.',
  },
  hu: {
    'settings.firewallManualHint': 'Nyissa meg a Beállítások > Hálózat menüpontot a tűzfal kézi beállításához.',
    'contacts.reloadedFromStorage': '{{total}} névjegy található a Hyperbee-ben, {{restored}} új visszaállítva.',
  },
  lv: {
    'settings.firewallManualHint': 'Atveriet Iestatījumi > Tīkls, lai manuāli konfigurētu ugunsmūri.',
    'contacts.reloadedFromStorage': 'Hyperbee atrasti {{total}} kontakti, atjaunoti {{restored}} jauni.',
  },
  lt: {
    'settings.firewallManualHint': 'Atidarykite Nustatymai > Tinklas, kad rankiniu būdu sukonfigūruotumėte užkardą.',
    'contacts.reloadedFromStorage': 'Hyperbee rasta {{total}} kontaktų, atkurti {{restored}} nauji.',
  },
  mt: {
    'settings.firewallManualHint': 'Iftaħ Settings > Network biex tikkonfigura l-firewall manwalment.',
    'contacts.reloadedFromStorage': 'Instabu {{total}} kuntatti fil-Hyperbee, ġew restawrati {{restored}} ġodda.',
  },
  pl: {
    'settings.firewallManualHint': 'Otwórz Ustawienia > Sieć, aby ręcznie skonfigurować zaporę.',
    'contacts.reloadedFromStorage': 'Znaleziono {{total}} kontaktów w Hyperbee, przywrócono {{restored}} nowych.',
  },
  sk: {
    'settings.firewallManualHint': 'Otvorte Nastavenia > Sieť, aby ste manuálne nakonfigurovali firewall.',
    'contacts.reloadedFromStorage': 'V Hyperbee sa našlo {{total}} kontaktov, obnovených {{restored}} nových.',
  },
  sl: {
    'settings.firewallManualHint': 'Odprite Nastavitve > Omrežje, da ročno konfigurirate požarni zid.',
    'contacts.reloadedFromStorage': 'V Hyperbee najdenih {{total}} stikov, obnovljenih {{restored}} novih.',
  },
  cs: {
    'settings.firewallManualHint': 'Otevřete Nastavení > Síť a ručně nakonfigurujte firewall.',
    'contacts.reloadedFromStorage': 'V Hyperbee nalezeno {{total}} kontaktů, obnoveno {{restored}} nových.',
  },
  bg: {
    'settings.firewallManualHint': 'Отворете Настройки > Мрежа, за да конфигурирате защитната стена ръчно.',
    'contacts.reloadedFromStorage': 'Намерени {{total}} контакта в Hyperbee, възстановени {{restored}} нови.',
  },
  ga: {
    'settings.firewallManualHint': 'Oscail Socruithe > Líonra chun an balla dóiteáin a chumrú de láimh.',
    'contacts.reloadedFromStorage': 'Fuarthas {{total}} teagmháil i Hyperbee, athchóiríodh {{restored}} ceann nua.',
  },
  ro: {
    'settings.firewallManualHint': 'Deschideți Setări > Rețea pentru a configura manual paravanul de firewall.',
    'contacts.reloadedFromStorage': '{{total}} contacte găsite în Hyperbee, {{restored}} noi restaurate.',
  },
  en: {
    'settings.firewallManualHint': 'Open Settings > Network to configure the firewall manually.',
    'contacts.reloadedFromStorage': 'Found {{total}} contacts in Hyperbee, restored {{restored}} new ones.',
  },
  uk: {
    'settings.firewallManualHint': 'Відкрийте Налаштування > Мережа, щоб налаштувати брандмауер вручну.',
    'contacts.reloadedFromStorage': 'Знайдено {{total}} контактів у Hyperbee, відновлено {{restored}} нових.',
  },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

const marks = []
lines.forEach((line, i) => {
  const m = /^ {2}([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

const known = Object.keys(DATA)
const missing = known.filter((c) => !marks.some((m) => m.code === c))
if (missing.length) {
  console.error(`✗ locale blocks not found in translations.ts: ${missing.join(', ')}`)
  process.exit(1)
}
const unknownBlocks = marks.filter((m) => !known.includes(m.code)).map((m) => m.code)
if (unknownBlocks.length) {
  console.error(`✗ translations.ts has locales without data: ${unknownBlocks.join(', ')}`)
  process.exit(1)
}

let replaced = 0
let inserted = 0

for (let b = marks.length - 1; b >= 0; b--) {
  const code = marks[b].code
  const start = marks[b].i + 1
  const end = b + 1 < marks.length ? marks[b + 1].i : lines.length
  const block = lines.slice(start, end)
  const table = DATA[code]
  const pending = []

  for (const key of KEYS) {
    const line = `      "${key}": "${escapeValue(table[key])}",`
    const re = new RegExp('^[ \\t]*"' + key.replace(/\./g, '\\.') + '":\\s*"(?:[^"\\\\]|\\\\.)*",?[ \\t]*$')
    const at = block.findIndex((l) => re.test(l))
    if (at >= 0) {
      if (block[at] !== line) { block[at] = line; replaced++ }
    } else {
      pending.push(line)
    }
  }

  if (pending.length) {
    let close = -1
    for (let i = block.length - 1; i >= 0; i--) {
      if (/^ {4}\}\s*,?\s*$/.test(block[i])) { close = i; break }
    }
    if (close < 0) {
      console.error(`✗ could not find the closing brace of the translation object in the ${code} block`)
      process.exit(1)
    }
    block.splice(close, 0, ...pending)
    inserted += pending.length
  }

  lines.splice(start, end - start, ...block)
}

writeFileSync(file, lines.join(eol), 'utf8')
console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
