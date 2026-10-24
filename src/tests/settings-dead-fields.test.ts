/**
 * Les réglages ne gardent plus de champs que personne ne lit : une langue
 * figée dans le store alors que l'i18n en supporte 25, et un relais réseau
 * dont aucun nœud relais n'existe dans le projet.
 */
import { describe, expect, it } from 'vitest'
import { useUIStore } from '@/stores/uiStore'

describe('schéma des réglages', () => {
  it('ne garde ni langue morte ni relais fantôme', () => {
    const settings = useUIStore.getState().settings as unknown as Record<string, unknown>

    expect(settings).not.toHaveProperty('language')
    const network = settings.network as Record<string, unknown>
    expect(Object.keys(network)).toEqual(['maxPeers'])
  })
})
