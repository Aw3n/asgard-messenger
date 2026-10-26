/**
 * La langue du document suit celle de l'interface.
 *
 * `index.html` figeait `<html lang="en">` et aucun code ne le corrigeait : un
 * lecteur d'écran annonçait le français avec une voix anglaise, et la synthèse
 * vocale des messages choisissait la mauvaise prononciation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Recharge le module i18n comme au démarrage, avec la langue déjà enregistrée. */
async function loadConfig(storedLanguage?: string) {
  vi.resetModules()
  localStorage.clear()
  if (storedLanguage) localStorage.setItem('asgard-language', storedLanguage)
  return import('@/i18n/config')
}

beforeEach(() => {
  // L'état laissé par index.html avant que le script ne tourne.
  document.documentElement.lang = 'en'
})

describe('<html lang>', () => {
  it('prend la langue enregistrée dès le chargement', async () => {
    const config = await loadConfig('de')

    expect(document.documentElement.lang).toBe('de')

    await config.i18nReady
    expect(document.documentElement.lang).toBe('de')
  })

  it('vaut le français par défaut, sans langue enregistrée', async () => {
    await loadConfig()

    expect(document.documentElement.lang).toBe('fr')
  })

  it('suit un changement de langue, dans les deux sens', async () => {
    const config = await loadConfig()
    await config.i18nReady

    expect(await config.changeLanguage('uk')).toBe(true)
    expect(document.documentElement.lang).toBe('uk')

    expect(await config.changeLanguage('fr')).toBe(true)
    expect(document.documentElement.lang).toBe('fr')
  })

  it('ne touche pas à la langue du document quand le catalogue manque', async () => {
    const config = await loadConfig()
    await config.i18nReady

    expect(await config.changeLanguage('xx')).toBe(false)
    expect(document.documentElement.lang).toBe('fr')
  })
})
