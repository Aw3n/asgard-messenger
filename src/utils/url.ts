/**
 * Une URL nue dans du texte. Les parenthèses et crochets en font partie : c'est
 * trimUrlEnd qui retire un fermant de prose, sans casser les chemins qui en
 * contiennent (Foo_(bar)).
 * Regex globale : à consommer avec match/matchAll, jamais avec exec.
 */
export const URL_IN_TEXT_RE = /\bhttps?:\/\/[^\s<>"']+/g

/**
 * Une URL collée dans une phrase traîne la ponctuation qui la suit : ouverte
 * telle quelle, elle donnerait une page inexistante. Les fermants ne sont
 * retirés que s'ils sont orphelins — ceux qui appartiennent au chemin (titres
 * Wikipédia) restent.
 */
export const trimUrlEnd = (raw: string): string => {
  let url = raw.replace(/[.,;:!?]+$/, '')
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']] as const) {
    while (url.endsWith(close)) {
      const opens = url.split(open).length - 1
      const closes = url.split(close).length - 1
      if (closes <= opens) break
      url = url.slice(0, -1)
    }
  }
  return url.replace(/["'`]+$/, '')
}

/** Première URL du texte, ponctuation de phrase retirée. */
export const firstUrlIn = (text: string): string | undefined => {
  const [match] = text.match(URL_IN_TEXT_RE) ?? []
  return match ? trimUrlEnd(match) : undefined
}
