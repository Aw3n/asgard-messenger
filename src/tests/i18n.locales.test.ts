/**
 * Catalogues de langue : le français (fallback) est disponible immédiatement,
 * les autres arrivent à la demande — et le rendu attend la langue enregistrée.
 */
import { afterEach, describe, expect, it } from 'vitest'
import i18n, { changeLanguage, i18nReady, SUPPORTED_LANGUAGES } from '@/i18n/config'
import fr from '@/i18n/locales/fr'
import { translations } from '@/i18n/translations'

afterEach(async () => {
  await changeLanguage('fr')
})

describe('catalogues de langue', () => {
  it('sert le français sans chargement et annonce les 25 langues', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(25)
    expect(i18n.hasResourceBundle('fr', 'translation')).toBe(true)
    expect(Object.keys(fr.translation)).toHaveLength(Object.keys(translations.fr.translation).length)
  })

  it('charge un catalogue à la demande puis applique la langue', async () => {
    await i18nReady
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(false)

    await changeLanguage('de')

    expect(i18n.language).toBe('de')
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(true)
    const key = 'common.save'
    expect(i18n.t(key)).toBe(translations.de.translation[key])
  })

  it('rend le libellé des épinglés dans chacune des 25 langues', async () => {
    await i18nReady
    // La barre des épinglés était française en codé en dur : une clé nouvelle ne
    // vaut livrée que traduite partout, et rendue par i18n, pas lue dans la table.
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      const label = i18n.t('chat.pinnedMessages')
      expect(label).toBe(translations[code].translation['chat.pinnedMessages'])
      expect(label).not.toBe('chat.pinnedMessages')
    }
  })
})
