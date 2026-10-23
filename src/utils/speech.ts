/**
 * Lecture à voix haute d'une notification, si la synthèse vocale existe.
 * Best-effort : une plateforme sans voix ne doit jamais faire échouer l'appel.
 */
export function speakText(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 300))
    utterance.lang = navigator.language || 'fr-FR'
    window.speechSynthesis.speak(utterance)
  } catch {
    // best-effort
  }
}
