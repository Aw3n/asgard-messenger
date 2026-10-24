/**
 * Activation de l'icône de tray.
 *
 * Windows émet `click` à chaque clic puis `double-click` au second : brancher
 * les deux sans arbitre ferait basculer la fenêtre trois fois, ce que
 * l'utilisateur voit comme un clignotement. Ces tests fixent l'arbitrage,
 * y compris pour les plateformes qui n'émettent que `click`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTrayActivation, TRAY_DOUBLE_CLICK_DELAY } from '../../electron/utils/trayActivation'

const setup = () => {
  const activate = vi.fn()
  const activation = createTrayActivation(activate)
  return { activate, activation }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('activation du tray', () => {
  it('un clic simple active après la fenêtre de double-clic', () => {
    const { activate, activation } = setup()

    activation.click()
    vi.advanceTimersByTime(TRAY_DOUBLE_CLICK_DELAY - 1)
    expect(activate).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('un double-clic Windows (clic, clic, double-click) n’active qu’une fois', () => {
    const { activate, activation } = setup()

    activation.click()
    activation.click()
    activation.doubleClick()
    vi.advanceTimersByTime(TRAY_DOUBLE_CLICK_DELAY * 2)

    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('un clic suivi du seul double-click n’active qu’une fois', () => {
    const { activate, activation } = setup()

    activation.click()
    activation.doubleClick()
    vi.advanceTimersByTime(TRAY_DOUBLE_CLICK_DELAY * 2)

    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('deux clics espacés comptent deux activations', () => {
    const { activate, activation } = setup()

    activation.click()
    vi.advanceTimersByTime(TRAY_DOUBLE_CLICK_DELAY)
    activation.click()
    vi.advanceTimersByTime(TRAY_DOUBLE_CLICK_DELAY)

    expect(activate).toHaveBeenCalledTimes(2)
  })

  it('annule un clic encore en attente à la destruction', () => {
    const { activate, activation } = setup()

    activation.click()
    activation.cancel()
    vi.advanceTimersByTime(TRAY_DOUBLE_CLICK_DELAY * 2)

    expect(activate).not.toHaveBeenCalled()
  })
})
