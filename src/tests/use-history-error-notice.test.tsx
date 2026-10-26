/**
 * Alerte d'une panne de lecture de l'historique.
 *
 * Une page qui échoue se retente aux bords suivants de la liste : sans garde,
 * chaque approche empilerait un toast. Le garde-fou ne doit pourtant pas
 * éteindre les pannes suivantes — ni une panne sur un autre fil.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistoryErrorNotice } from '@/hooks/useHistoryErrorNotice'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const KEY = 'chat.historyLoadFailed'

const titles = () => useUIStore.getState().toasts.map((toast) => toast.title)

beforeEach(() => {
  useUIStore.setState({ toasts: [] })
})

describe('alerte de panne d’historique', () => {
  it('n’annonce une même panne qu’une fois', () => {
    const { result } = renderHook(() => useHistoryErrorNotice('fil'))

    act(() => result.current.noticeHistoryError())
    act(() => result.current.noticeHistoryError())

    expect(titles()).toEqual([KEY])
  })

  it('rouvre l’alerte après une lecture qui réussit', () => {
    const { result } = renderHook(() => useHistoryErrorNotice('fil'))

    act(() => result.current.noticeHistoryError())
    act(() => result.current.historyLoaded())
    act(() => result.current.noticeHistoryError())

    expect(titles()).toEqual([KEY, KEY])
  })

  it('rouvre l’alerte quand le fil change', () => {
    const { result, rerender } = renderHook(
      ({ dataId }: { dataId: string }) => useHistoryErrorNotice(dataId),
      { initialProps: { dataId: 'fil-a' } },
    )

    act(() => result.current.noticeHistoryError())
    rerender({ dataId: 'fil-b' })
    act(() => result.current.noticeHistoryError())

    expect(titles()).toEqual([KEY, KEY])
  })
})
