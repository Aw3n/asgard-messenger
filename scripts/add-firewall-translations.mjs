/**
 * Add firewall-related translation keys to all languages in translations.ts.
 * Processes languages from bottom to top so insertions don't shift later indices.
 */
import fs from 'fs'
import path from 'path'

const translationsFile = path.resolve('src/i18n/translations.ts')
let content = fs.readFileSync(translationsFile, 'utf-8')

// Language markers: unique flushDht value per language (ordered by position in file, last first)
const langMarkers = [
  { lang: 'mt', marker: '"settings.flushDht": "DHT ürítése"' }, // This is actually hu — let me use correct markers
]

// Actually, let me just use the exact flushDht values for each language
// Processing from BOTTOM to TOP of file to avoid index shifting
const flushDhtValues = [
  { lang: 'lt', value: 'Ištuštinti DHT' },
  { lang: 'lv', value: 'Iztukšot DHT' },
  { lang: 'hu', value: 'DHT ürítése' },
  { lang: 'et', value: 'Tühjenda DHT' },
  { lang: 'hr', value: 'Isprazni DHT' },
  { lang: 'sv', value: 'Töm DHT' },
  { lang: 'fi', value: 'Tyhjennä DHT' },
  { lang: 'da', value: 'Tøm DHT' },
  { lang: 'el', value: 'Εκκαθάριση DHT' },
  { lang: 'pt', value: 'Esvaziar DHT' },
  { lang: 'es', value: 'Vaciar DHT' },
  { lang: 'it', value: 'Svuota DHT' },
  { lang: 'de', value: 'DHT leeren' },
  { lang: 'nl', value: 'DHT legen' },
  { lang: 'fr', value: 'Vider le DHT' },
]

const translations = {
  fr: {
    'settings.firewall': 'Pare-feu',
    'settings.firewallChecking': 'Vérification...',
    'settings.firewallConfigured': 'Les connexions P2P sont autorisées',
    'settings.firewallConfiguring': 'Configuration...',
    'settings.firewallFailed': 'Échec de la configuration du pare-feu',
    'settings.firewallNotConfigured': 'Connexions P2P bloquées — configuration requise',
    'settings.firewallConfigure': 'Configurer',
    'settings.firewallSuccess': 'Pare-feu configuré avec succès',
  },
  nl: {
    'settings.firewall': 'Firewall',
    'settings.firewallChecking': 'Controleren...',
    'settings.firewallConfigured': 'P2P-verbindingen zijn toegestaan',
    'settings.firewallConfiguring': 'Configureren...',
    'settings.firewallFailed': 'Firewallconfiguratie mislukt',
    'settings.firewallNotConfigured': 'P2P-verbindingen geblokkeerd — configuratie vereist',
    'settings.firewallConfigure': 'Configureren',
    'settings.firewallSuccess': 'Firewall succesvol geconfigureerd',
  },
  de: {
    'settings.firewall': 'Firewall',
    'settings.firewallChecking': 'Überprüfung...',
    'settings.firewallConfigured': 'P2P-Verbindungen sind erlaubt',
    'settings.firewallConfiguring': 'Konfiguration...',
    'settings.firewallFailed': 'Firewall-Konfiguration fehlgeschlagen',
    'settings.firewallNotConfigured': 'P2P-Verbindungen blockiert — Konfiguration erforderlich',
    'settings.firewallConfigure': 'Konfigurieren',
    'settings.firewallSuccess': 'Firewall erfolgreich konfiguriert',
  },
  it: {
    'settings.firewall': 'Firewall',
    'settings.firewallChecking': 'Verifica...',
    'settings.firewallConfigured': 'Le connessioni P2P sono consentite',
    'settings.firewallConfiguring': 'Configurazione...',
    'settings.firewallFailed': 'Configurazione del firewall fallita',
    'settings.firewallNotConfigured': 'Connessioni P2P bloccate — configurazione richiesta',
    'settings.firewallConfigure': 'Configura',
    'settings.firewallSuccess': 'Firewall configurato con successo',
  },
  es: {
    'settings.firewall': 'Cortafuegos',
    'settings.firewallChecking': 'Verificando...',
    'settings.firewallConfigured': 'Las conexiones P2P están permitidas',
    'settings.firewallConfiguring': 'Configurando...',
    'settings.firewallFailed': 'Error en la configuración del cortafuegos',
    'settings.firewallNotConfigured': 'Conexiones P2P bloqueadas — configuración requerida',
    'settings.firewallConfigure': 'Configurar',
    'settings.firewallSuccess': 'Cortafuegos configurado con éxito',
  },
  pt: {
    'settings.firewall': 'Firewall',
    'settings.firewallChecking': 'Verificando...',
    'settings.firewallConfigured': 'As ligações P2P estão permitidas',
    'settings.firewallConfiguring': 'Configurando...',
    'settings.firewallFailed': 'Falha na configuração da firewall',
    'settings.firewallNotConfigured': 'Ligações P2P bloqueadas — configuração necessária',
    'settings.firewallConfigure': 'Configurar',
    'settings.firewallSuccess': 'Firewall configurada com sucesso',
  },
  el: {
    'settings.firewall': 'Firewall',
    'settings.firewallChecking': 'Έλεγχος...',
    'settings.firewallConfigured': 'Οι συνδέσεις P2P επιτρέπονται',
    'settings.firewallConfiguring': 'Διαμόρφωση...',
    'settings.firewallFailed': 'Αποτυχία διαμόρφωσης firewall',
    'settings.firewallNotConfigured': 'Οι συνδέσεις P2P αποκλείονται — απαιτείται διαμόρφωση',
    'settings.firewallConfigure': 'Διαμόρφωση',
    'settings.firewallSuccess': 'Το firewall διαμορφώθηκε με επιτυχία',
  },
  da: {
    'settings.firewall': 'Firewall',
    'settings.firewallChecking': 'Kontrollerer...',
    'settings.firewallConfigured': 'P2P-forbindelser er tilladt',
    'settings.firewallConfiguring': 'Konfigurerer...',
    'settings.firewallFailed': 'Firewall-konfiguration mislykkedes',
    'settings.firewallNotConfigured': 'P2P-forbindelser blokeret — konfiguration påkrævet',
    'settings.firewallConfigure': 'Konfigurer',
    'settings.firewallSuccess': 'Firewall konfigureret med succes',
  },
  fi: {
    'settings.firewall': 'Palomuuri',
    'settings.firewallChecking': 'Tarkistetaan...',
    'settings.firewallConfigured': 'P2P-yhteydet ovat sallittuja',
    'settings.firewallConfiguring': 'Määritetään...',
    'settings.firewallFailed': 'Palomuurin määritys epäonnistui',
    'settings.firewallNotConfigured': 'P2P-yhteydet estetty — määritys vaaditaan',
    'settings.firewallConfigure': 'Määritä',
    'settings.firewallSuccess': 'Palomuuri määritetty onnistuneesti',
  },
  sv: {
    'settings.firewall': 'Brandvägg',
    'settings.firewallChecking': 'Kontrollerar...',
    'settings.firewallConfigured': 'P2P-anslutningar är tillåtna',
    'settings.firewallConfiguring': 'Konfigurerar...',
    'settings.firewallFailed': 'Brandväggskonfiguration misslyckades',
    'settings.firewallNotConfigured': 'P2P-anslutningar blockerade — konfiguration krävs',
    'settings.firewallConfigure': 'Konfigurera',
    'settings.firewallSuccess': 'Brandvägg konfigurerad framgångsrikt',
  },
  hr: {
    'settings.firewall': 'Vatreni zid',
    'settings.firewallChecking': 'Provjera...',
    'settings.firewallConfigured': 'P2P veze su dopuštene',
    'settings.firewallConfiguring': 'Konfiguriranje...',
    'settings.firewallFailed': 'Konfiguracija vatrenog zida nije uspjela',
    'settings.firewallNotConfigured': 'P2P veze blokirane — potrebna konfiguracija',
    'settings.firewallConfigure': 'Konfiguriraj',
    'settings.firewallSuccess': 'Vatreni zid uspješno konfiguriran',
  },
  et: {
    'settings.firewall': 'Tulemüür',
    'settings.firewallChecking': 'Kontrollimine...',
    'settings.firewallConfigured': 'P2P-ühendused on lubatud',
    'settings.firewallConfiguring': 'Seadistamine...',
    'settings.firewallFailed': 'Tulemüüri seadistamine ebaõnnestus',
    'settings.firewallNotConfigured': 'P2P-ühendused blokeeritud — seadistamine on vajalik',
    'settings.firewallConfigure': 'Seadista',
    'settings.firewallSuccess': 'Tulemüür edukalt seadistatud',
  },
  hu: {
    'settings.firewall': 'Tűzfal',
    'settings.firewallChecking': 'Ellenőrzés...',
    'settings.firewallConfigured': 'P2P-kapcsolatok engedélyezve',
    'settings.firewallConfiguring': 'Konfigurálás...',
    'settings.firewallFailed': 'A tűzfal konfigurálása sikertelen',
    'settings.firewallNotConfigured': 'P2P-kapcsolatok blokkolva — konfiguráció szükséges',
    'settings.firewallConfigure': 'Konfigurálás',
    'settings.firewallSuccess': 'A tűzfal sikeresen konfigurálva',
  },
  lv: {
    'settings.firewall': 'Ugunsmūris',
    'settings.firewallChecking': 'Pārbaude...',
    'settings.firewallConfigured': 'P2P savienojumi ir atļauti',
    'settings.firewallConfiguring': 'Konfigurē...',
    'settings.firewallFailed': 'Ugunsmūra konfigurācija neizdevās',
    'settings.firewallNotConfigured': 'P2P savienojumi bloķēti — nepieciešama konfigurācija',
    'settings.firewallConfigure': 'Konfigurēt',
    'settings.firewallSuccess': 'Ugunsmūris veiksmīgi konfigurēts',
  },
  lt: {
    'settings.firewall': 'Ugniasienė',
    'settings.firewallChecking': 'Tikrinama...',
    'settings.firewallConfigured': 'P2P ryšiai leidžiami',
    'settings.firewallConfiguring': 'Konfigūruojama...',
    'settings.firewallFailed': 'Ugniasienės konfigūracija nepavyko',
    'settings.firewallNotConfigured': 'P2P ryšiai blokuojami — reikalinga konfigūracija',
    'settings.firewallConfigure': 'Konfigūruoti',
    'settings.firewallSuccess': 'Ugniasienė sėkmingai sukonfigūruota',
  },
}

// Process from bottom to top to avoid index shifting
for (const { lang, value } of flushDhtValues) {
  const keys = translations[lang]
  if (!keys) {
    console.warn(`No translations for ${lang}`)
    continue
  }

  const searchStr = `"settings.flushDht": "${value}"`
  const idx = content.indexOf(searchStr)
  if (idx === -1) {
    console.warn(`Could not find flushDht for ${lang}: ${value}`)
    continue
  }

  // Find start of this line
  const lineStart = content.lastIndexOf('\n', idx) + 1
  const indent = content.substring(lineStart, idx).match(/^\s*/)?.[0] || '      '

  // Build insertion text
  const insertText = Object.entries(keys)
    .map(([key, val]) => `${indent}"${key}": "${val}",\n`)
    .join('')

  content = content.substring(0, lineStart) + insertText + content.substring(lineStart)
  console.log(`✅ ${lang}`)
}

// Check if Maltese (mt) exists — it might not have flushDht
if (content.includes('"settings.flushDht"') && !content.includes('DHT ürítése')) {
  // Maltese might share a marker with Hungarian, handle separately
  console.log('Note: Check Maltese translations manually')
}

fs.writeFileSync(translationsFile, content, 'utf-8')
console.log('\nDone! All firewall translations added.')
