import { describe, it, expect, vi, afterEach } from 'vitest'
import { watchWindowVisibility } from '@/utils/windowVisibility'

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

describe('watchWindowVisibility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'visibilityState')
  })

  it('ne signale visible que si la page est affichée et la fenêtre focalisée', () => {
    setVisibilityState('visible')
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const onChange = vi.fn()
    const stop = watchWindowVisibility(onChange)

    expect(onChange).toHaveBeenLastCalledWith(true)

    hasFocus.mockReturnValue(false)
    window.dispatchEvent(new Event('blur'))
    expect(onChange).toHaveBeenLastCalledWith(false)

    hasFocus.mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))
    expect(onChange).toHaveBeenLastCalledWith(true)

    setVisibilityState('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onChange).toHaveBeenLastCalledWith(false)

    stop()
  })

  it('cesse d’écouter après désabonnement', () => {
    setVisibilityState('visible')
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const onChange = vi.fn()
    const stop = watchWindowVisibility(onChange)
    onChange.mockClear()
    stop()

    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(onChange).not.toHaveBeenCalled()
  })
})
