/**
 * peek-values.mjs — one-off helper: prints current values of specific keys
 * across languages, to calibrate the translation worklist.
 */
import fs from 'fs'

const c = fs.readFileSync('src/i18n/translations.ts', 'utf8')
const langs = {}
let cur = null
for (const line of c.split('\n')) {
  const b = line.match(/^  ([a-z]{2}): \{/)
  if (b) { cur = b[1]; langs[cur] = {}; continue }
  if (cur && line.startsWith('      "')) {
    const k = line.match(/^      "((?:[^"\\]|\\.)+)": "(.*)",?$/)
    if (k) langs[cur][k[1]] = k[2]
  }
}

const keys = [
  // uk-missing keys
  'calls.holdLabel', 'calls.holdCall', 'calls.resumeCall', 'calls.settingsLabel',
  'calls.callSettings', 'calls.stopScreenShare', 'calls.videoQuality',
  'calls.qualityHigh', 'calls.qualityMedium', 'calls.qualityLow',
  'calls.noiseSuppression', 'calls.noiseSuppressionDesc',
  'calls.echoCancellation', 'calls.echoCancellationDesc',
  'chat.sendingFile', 'chat.receivingFile', 'chat.transfersActive', 'chat.sending',
  // firewall keys
  'settings.firewall', 'settings.firewallChecking', 'settings.firewallConfigured',
  'settings.firewallConfiguring', 'settings.firewallFailed',
  'settings.firewallNotConfigured', 'settings.firewallConfigure', 'settings.firewallSuccess',
  // lightbox + restore keys (17)
  'lightbox.zoomIn', 'lightbox.zoomOut', 'lightbox.resetZoom', 'lightbox.fit',
  'lightbox.download', 'lightbox.close', 'lightbox.scrollZoom', 'lightbox.dragToPan',
  'onboarding.restoreIdentity', 'onboarding.restoreDesc', 'onboarding.seedPhrasePlaceholder',
  'onboarding.restoring', 'onboarding.identityRestored', 'onboarding.restoreFailed',
  'onboarding.seedPhraseInvalid', 'onboarding.words', 'onboarding.back',
]
for (const k of keys) {
  const val = (l) => (langs[l] && langs[l][k] !== undefined ? langs[l][k] : '<none>')
  console.log(`${k}\n   FR: ${val('fr')}\n   EN: ${val('en')}\n   ES: ${val('es')}\n   DE: ${val('de')}\n   NL: ${val('nl')}\n   UK: ${val('uk')}`)
}

// pt register calibration
console.log('\n=== PT calibration ===')
for (const k of ['settings.camera', 'settings.notifications', 'settings.recoveryPhrase',
  'groups.create', 'modal.cancel', 'settings.testMic', 'contacts.add', 'nav.messages',
  'settings.microphone', 'settings.speaker']) {
  console.log(`PT ${k}: ${langs.pt && langs.pt[k] !== undefined ? langs.pt[k] : '<none>'}`)
}
console.log('\n=== ES/DE calibration (same keys) ===')
for (const k of ['settings.microphone', 'settings.speaker']) {
  console.log(`ES ${k}: ${langs.es[k] ?? '<none>'} | DE ${k}: ${langs.de[k] ?? '<none>'}`)
}
