/**
 * En lituanien, « en ligne » n'est pas invariable : un membre est
 * « prisijungęs », plusieurs sont « prisijungę ». La clé n'avait aucune forme
 * plurielle, donc i18next servait le pluriel à toutes les valeurs et la liste
 * des membres affichait « 1 prisijungę ».
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import i18n, { changeLanguage } from '@/i18n/config'

beforeAll(async () => {
  expect(await changeLanguage('lt')).toBe(true)
})

afterAll(async () => {
  await changeLanguage('fr')
})

describe('accord du nombre en lituanien', () => {
  it('un seul membre connecté se dit au singulier', () => {
    expect(i18n.t('groups.onlineMembers', { count: 1 })).toBe('1 prisijungęs')
    expect(i18n.t('groups.onlineMembers', { count: 21 })).toBe('21 prisijungęs')
  })

  it('zéro et plusieurs membres gardent le pluriel', () => {
    expect(i18n.t('groups.onlineMembers', { count: 0 })).toBe('0 prisijungę')
    expect(i18n.t('groups.onlineMembers', { count: 2 })).toBe('2 prisijungę')
    expect(i18n.t('groups.onlineMembers', { count: 11 })).toBe('11 prisijungę')
  })
})
