import fs from 'fs'

const f = 'src/i18n/translations.ts'
let c = fs.readFileSync(f, 'utf8')

// Keys to add for each language section
const translations = {
  en: {
    'onboarding.restoreIdentity': 'Restore identity',
    'onboarding.restoreDesc': 'Enter your 24-word seed phrase to recover your identity and keys.',
    'onboarding.seedPhrasePlaceholder': 'word1 word2 word3 ... word24',
    'onboarding.restoring': 'Restoring...',
    'onboarding.identityRestored': 'Identity restored successfully!',
    'onboarding.restoreFailed': 'Failed to restore identity. Check your seed phrase.',
    'onboarding.seedPhraseInvalid': 'Please enter exactly 24 words',
    'onboarding.words': 'words',
    'onboarding.back': 'Back',
  },
  fr: {
    'onboarding.restoreIdentity': 'Restaurer l\'identité',
    'onboarding.restoreDesc': 'Entrez votre phrase de récupération de 24 mots pour récupérer votre identité et vos clés.',
    'onboarding.seedPhrasePlaceholder': 'mot1 mot2 mot3 ... mot24',
    'onboarding.restoring': 'Restauration...',
    'onboarding.identityRestored': 'Identité restaurée avec succès !',
    'onboarding.restoreFailed': 'Échec de la restauration. Vérifiez votre phrase de récupération.',
    'onboarding.seedPhraseInvalid': 'Veuillez entrer exactement 24 mots',
    'onboarding.words': 'mots',
    'onboarding.back': 'Retour',
  },
  nl: {
    'onboarding.restoreIdentity': 'Identiteit herstellen',
    'onboarding.restoreDesc': 'Voer uw 24-woordige seed phrase in om uw identiteit en sleutels te herstellen.',
    'onboarding.seedPhrasePlaceholder': 'woord1 woord2 woord3 ... woord24',
    'onboarding.restoring': 'Herstellen...',
    'onboarding.identityRestored': 'Identiteit succesvol hersteld!',
    'onboarding.restoreFailed': 'Herstellen mislukt. Controleer uw seed phrase.',
    'onboarding.seedPhraseInvalid': 'Voer precies 24 woorden in',
    'onboarding.words': 'woorden',
    'onboarding.back': 'Terug',
  },
  de: {
    'onboarding.restoreIdentity': 'Identität wiederherstellen',
    'onboarding.restoreDesc': 'Geben Sie Ihre 24-Wort-Seed-Phrase ein, um Ihre Identität und Schlüssel wiederherzustellen.',
    'onboarding.seedPhrasePlaceholder': 'Wort1 Wort2 Wort3 ... Wort24',
    'onboarding.restoring': 'Wiederherstellung...',
    'onboarding.identityRestored': 'Identität erfolgreich wiederhergestellt!',
    'onboarding.restoreFailed': 'Wiederherstellung fehlgeschlagen. Überprüfen Sie Ihre Seed-Phrase.',
    'onboarding.seedPhraseInvalid': 'Bitte geben Sie genau 24 Wörter ein',
    'onboarding.words': 'Wörter',
    'onboarding.back': 'Zurück',
  },
  es: {
    'onboarding.restoreIdentity': 'Restaurar identidad',
    'onboarding.restoreDesc': 'Ingrese su frase semilla de 24 palabras para recuperar su identidad y claves.',
    'onboarding.seedPhrasePlaceholder': 'palabra1 palabra2 palabra3 ... palabra24',
    'onboarding.restoring': 'Restaurando...',
    'onboarding.identityRestored': '¡Identidad restaurada con éxito!',
    'onboarding.restoreFailed': 'Error al restaurar. Verifique su frase semilla.',
    'onboarding.seedPhraseInvalid': 'Ingrese exactamente 24 palabras',
    'onboarding.words': 'palabras',
    'onboarding.back': 'Atrás',
  },
}

// For each language, find the onboarding.createFailed key and insert after it
for (const [lang, keys] of Object.entries(translations)) {
  // Find all occurrences of onboarding.createFailed
  let searchFrom = 0
  let count = 0
  while (true) {
    const idx = c.indexOf('"onboarding.createFailed"', searchFrom)
    if (idx === -1) break
    count++
    const lineEnd = c.indexOf('\n', idx)
    
    // Check if restoreIdentity already exists nearby
    const nextSection = c.slice(idx, idx + 500)
    if (nextSection.includes('onboarding.restoreIdentity')) {
      searchFrom = lineEnd + 1
      continue
    }
    
    // Insert new keys after this line
    let insert = ''
    for (const [k, v] of Object.entries(keys)) {
      insert += `    "${k}": "${v}",\n`
    }
    c = c.slice(0, lineEnd + 1) + insert + c.slice(lineEnd + 1)
    console.log(`Added ${lang} keys at occurrence ${count}`)
    break // Only add to first occurrence (English section)
  }
}

// For French, find the French section specifically
const frIdx = c.indexOf('"onboarding.createFailed": "Échec')
if (frIdx > 0) {
  const lineEnd = c.indexOf('\n', frIdx)
  const nextSection = c.slice(frIdx, frIdx + 500)
  if (!nextSection.includes('onboarding.restoreIdentity')) {
    let insert = ''
    for (const [k, v] of Object.entries(translations.fr)) {
      insert += `      "${k}": "${v}",\n`
    }
    c = c.slice(0, lineEnd + 1) + insert + c.slice(lineEnd + 1)
    console.log('Added FR keys')
  }
}

fs.writeFileSync(f, c)
console.log('Done')
