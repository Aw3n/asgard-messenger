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

  /**
   * Une clé nouvelle n'est livrée que rendue dans TOUTES les langues — vérifiée
   * par i18n, pas relue dans la table. Cinq venues corriger du texte codé en
   * dur dans le JSX ou une action sans visage : la barre des épinglés (français),
   * la mention de licence (« MIT License. » accolé à un nom déjà traduit),
   * l'annonce de résultats coupés, la sourdine d'un membre (six chaînes pour une
   * action que seul le code savait poser), le refus d'écrire dans un canal.
   */
  it('rend les livrées récentes dans chacune des 25 langues', async () => {
    await i18nReady
    const keys = [
      'chat.pinnedMessages', 'settings.openSourceLicense', 'search.moreResults',
      'groups.muteMember', 'groups.unmuteMember', 'groups.memberMuted',
      'groups.memberUnmuted', 'groups.muteFailed', 'groups.mutedInGroup',
      'groups.cannotPostInChannel',
    ] as const
    for (const key of keys) {
      for (const { code } of SUPPORTED_LANGUAGES) {
        await changeLanguage(code)
        const value = i18n.t(key)
        expect(value, `${code} · ${key}`).toBe(translations[code].translation[key])
        expect(value).not.toBe(key)
        // La phrase ne doit plus traîner son reste anglais hors de l'anglais.
        if (code !== 'en') expect(value).not.toMatch(/MIT License/)
      }
    }
  })

  /**
   * « Mettre en sourdine » et « rétablir » sont deux actions contraires posées
   * sur le même bouton : une table recopiée de travers leur donnerait le même
   * texte, et l'administrateur ne saurait plus lequel il appuie.
   */
  it('distingue l’action de sourdine de son contraire dans chaque langue', async () => {
    await i18nReady
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      expect(i18n.t('groups.muteMember'), code).not.toBe(i18n.t('groups.unmuteMember'))
      expect(i18n.t('groups.memberMuted'), code).not.toBe(i18n.t('groups.memberUnmuted'))
    }
  })

  /**
   * Deux raisons ferment le même composeur — la sourdine d'un admin et un canal
   * qui n'ouvre l'écriture qu'à certains rôles. Un texte commun ferait croire au
   * membre qu'on l'a tu lui, alors que c'est le canal.
   */
  it('distingue les deux raisons qui ferment un composeur dans chaque langue', async () => {
    await i18nReady
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      expect(i18n.t('groups.cannotPostInChannel'), code).not.toBe(i18n.t('groups.mutedInGroup'))
    }
  })

  /**
   * Gestion des canaux : seize chaînes pour une action que seul le code savait
   * poser — dont une qui interpolate la liste des rôles autorisés à écrire. Un
   * catalogue recopié de travers rendrait « {{roles}} » à l'écran, ou donnerait
   * le même libellé à deux types de canal que l'administrateur doit distinguer.
   */
  it('rend la gestion des canaux dans chacune des 25 langues', async () => {
    await i18nReady
    const keys = [
      'groups.addChannel', 'groups.createChannel', 'groups.deleteChannel', 'common.create',
      'groups.channelName', 'groups.channelType', 'groups.channelNameRequired', 'groups.channelNameExists',
      'groups.channelTypeText', 'groups.channelTypeAnnouncement', 'groups.channelTypeReadonly',
      'groups.channelTypeWhoWrites', 'groups.channelCreated', 'groups.channelCreateFailed',
      'groups.channelDeleted', 'groups.channelDeleteFailed',
    ] as const
    for (const key of keys) {
      for (const { code } of SUPPORTED_LANGUAGES) {
        await changeLanguage(code)
        const value = i18n.t(key)
        expect(value, `${code} · ${key}`).toBe(translations[code].translation[key])
        expect(value, `${code} · ${key}`).not.toBe(key)
      }
    }
  })

  it('interpole les rôles qui peuvent écrire dans chaque langue', async () => {
    await i18nReady
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      const rendered = i18n.t('groups.channelTypeWhoWrites', { roles: 'propriétaire, admin' })
      expect(rendered, code).toContain('propriétaire, admin')
      expect(rendered, code).not.toContain('{{')
    }
  })

  it('donne un nom different à chaque type de canal dans chaque langue', async () => {
    await i18nReady
    const types = ['groups.channelTypeText', 'groups.channelTypeAnnouncement', 'groups.channelTypeReadonly'] as const
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      const labels = types.map((key) => i18n.t(key))
      expect(new Set(labels).size, `${code} · ${labels.join(' / ')}`).toBe(labels.length)
      // Trois libellés de type qui ne se confondent pas non plus avec le nom
      // du champ, la création et la suppression.
      for (const other of ['groups.channelType', 'groups.createChannel', 'groups.deleteChannel', 'groups.addChannel']) {
        expect(labels, `${code} · ${other}`).not.toContain(i18n.t(other))
      }
    }
  })

  /** Succès et échec de la même action : les confondre ferait croire à une
   *  création passée alors que le pair est hors ligne. */
  it('distingue le succès de l’échec de chaque action de canal dans chaque langue', async () => {
    await i18nReady
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      expect(i18n.t('groups.channelCreated'), code).not.toBe(i18n.t('groups.channelCreateFailed'))
      expect(i18n.t('groups.channelDeleted'), code).not.toBe(i18n.t('groups.channelDeleteFailed'))
      expect(i18n.t('groups.channelNameRequired'), code).not.toBe(i18n.t('groups.channelNameExists'))
      expect(i18n.t('groups.addChannel'), code).not.toBe(i18n.t('groups.deleteChannel'))
    }
  })

  /**
   * Téléchargement : sept chaînes pour deux réglages que le code lisait déjà sans
   * que personne ne puisse les poser. Le libellé de taille ne doit pas se
   * confondre avec celui du plafond de cache (deux curseurs sur la même carte) et
   * les deux gestes du dossier — choisir, revenir en arrière — sont contraires.
   */
  it('rend le lot téléchargement dans chacune des 25 langues', async () => {
    await i18nReady
    const keys = [
      'settings.autoDownloadMaxLabel', 'settings.autoDownloadMaxDesc',
      'settings.downloadFolder', 'settings.downloadFolderNone', 'settings.downloadFolderDesc',
      'settings.downloadFolderChoose', 'settings.downloadFolderReset',
    ] as const
    for (const key of keys) {
      for (const { code } of SUPPORTED_LANGUAGES) {
        await changeLanguage(code)
        const value = i18n.t(key)
        expect(value, `${code} · ${key}`).toBe(translations[code].translation[key])
        expect(value, `${code} · ${key}`).not.toBe(key)
        if (code !== 'fr') expect(value, `${code} · ${key}`).not.toBe(translations.fr.translation[key])
      }
    }
  })

  it('distingue les deux curseurs de la carte Stockage dans chaque langue', async () => {
    await i18nReady
    for (const { code } of SUPPORTED_LANGUAGES) {
      await changeLanguage(code)
      expect(i18n.t('settings.autoDownloadMaxLabel'), code).not.toBe(i18n.t('settings.cacheLimitLabel'))
      expect(i18n.t('settings.autoDownloadMaxDesc'), code).not.toBe(i18n.t('settings.cacheLimitDesc'))
      expect(i18n.t('settings.downloadFolder'), code).not.toBe(i18n.t('settings.downloadFolderNone'))
      expect(i18n.t('settings.downloadFolderChoose'), code).not.toBe(i18n.t('settings.downloadFolderReset'))
    }
  })
})
