import fs from 'fs'

const f = 'src/i18n/translations.ts'
let c = fs.readFileSync(f, 'utf8')

const translations = [
  { lang: 'en', keys: {
    'lightbox.zoomIn': 'Zoom in',
    'lightbox.zoomOut': 'Zoom out',
    'lightbox.resetZoom': 'Reset zoom',
    'lightbox.fit': 'Fit',
    'lightbox.download': 'Download',
    'lightbox.close': 'Close',
    'lightbox.scrollZoom': 'Scroll to zoom · Click image to close',
    'lightbox.dragToPan': 'Drag to pan · Use +/- keys to zoom',
  }},
  { lang: 'fr', keys: {
    'lightbox.zoomIn': 'Zoomer',
    'lightbox.zoomOut': 'Dézoomer',
    'lightbox.resetZoom': 'Réinitialiser le zoom',
    'lightbox.fit': 'Ajuster',
    'lightbox.download': 'Télécharger',
    'lightbox.close': 'Fermer',
    'lightbox.scrollZoom': 'Molette pour zoomer · Cliquer sur l\'image pour fermer',
    'lightbox.dragToPan': 'Glisser pour déplacer · +/- pour zoomer',
  }},
  { lang: 'nl', keys: {
    'lightbox.zoomIn': 'Inzoomen',
    'lightbox.zoomOut': 'Uitzoomen',
    'lightbox.resetZoom': 'Zoom resetten',
    'lightbox.fit': 'Passend',
    'lightbox.download': 'Downloaden',
    'lightbox.close': 'Sluiten',
    'lightbox.scrollZoom': 'Scroll om te zoomen · Klik op afbeelding om te sluiten',
    'lightbox.dragToPan': 'Sleep om te verplaatsen · +/- om te zoomen',
  }},
  { lang: 'de', keys: {
    'lightbox.zoomIn': 'Vergrößern',
    'lightbox.zoomOut': 'Verkleinern',
    'lightbox.resetZoom': 'Zoom zurücksetzen',
    'lightbox.fit': 'Anpassen',
    'lightbox.download': 'Herunterladen',
    'lightbox.close': 'Schließen',
    'lightbox.scrollZoom': 'Scrollen zum Zoomen · Klick zum Schließen',
    'lightbox.dragToPan': 'Ziehen zum Verschieben · +/- zum Zoomen',
  }},
  { lang: 'es', keys: {
    'lightbox.zoomIn': 'Acercar',
    'lightbox.zoomOut': 'Alejar',
    'lightbox.resetZoom': 'Restablecer zoom',
    'lightbox.fit': 'Ajustar',
    'lightbox.download': 'Descargar',
    'lightbox.close': 'Cerrar',
    'lightbox.scrollZoom': 'Desplazar para zoom · Clic para cerrar',
    'lightbox.dragToPan': 'Arrastrar para mover · +/- para zoom',
  }},
]

for (const { lang, keys } of translations) {
  // Find the onboarding.createFailed key for this language section
  const anchor = `"onboarding.createFailed"`
  let searchFrom = 0
  let found = false
  
  // For non-English languages, we need to find the right section
  // The file has sections like: en: { ... }, fr: { ... }, etc.
  // Each section has its own onboarding.createFailed
  
  // Find all occurrences and pick the right one based on language
  const occurrences = []
  let idx = -1
  while (true) {
    idx = c.indexOf(anchor, idx + 1)
    if (idx === -1) break
    occurrences.push(idx)
  }
  
  // Map language to occurrence index
  const langOrder = ['en', 'fr', 'nl', 'de', 'es', 'it', 'pt', 'el', 'da', 'fi', 'sv', 'hr', 'et', 'hu', 'lv', 'lt']
  const langIdx = langOrder.indexOf(lang)
  
  if (langIdx >= 0 && langIdx < occurrences.length) {
    const targetIdx = occurrences[langIdx]
    const lineEnd = c.indexOf('\n', targetIdx)
    
    // Check if lightbox keys already exist nearby
    const nextSection = c.slice(targetIdx, targetIdx + 1000)
    if (nextSection.includes('lightbox.zoomIn')) {
      console.log(`${lang}: lightbox keys already exist, skipping`)
      continue
    }
    
    let insert = ''
    for (const [k, v] of Object.entries(keys)) {
      insert += `    "${k}": "${v}",\n`
    }
    c = c.slice(0, lineEnd + 1) + insert + c.slice(lineEnd + 1)
    console.log(`${lang}: added lightbox keys`)
    found = true
  }
  
  if (!found) {
    console.log(`${lang}: could not find insertion point`)
  }
}

fs.writeFileSync(f, c)
console.log('Done')
