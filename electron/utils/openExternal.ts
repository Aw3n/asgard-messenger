import { shell } from 'electron'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Ouvre un lien dans le navigateur du système après validation du schéma.
 * `shell.openExternal` exécute ce qu'on lui donne : sans liste blanche, un
 * `file://`, un `smb://` ou un protocole applicatif enregistré devient un
 * lanceur arbitraire depuis n'importe quel lien reçu dans un message.
 */
export function openExternalSafe(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      console.warn('[openExternal] Blocked non-http(s) URL:', rawUrl.slice(0, 120))
      return false
    }
    void shell.openExternal(rawUrl)
    return true
  } catch {
    console.warn('[openExternal] Invalid URL blocked:', String(rawUrl).slice(0, 120))
    return false
  }
}
