import { useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'

/**
 * Les réglages d'accessibilité et d'apparence posent leurs classes sur `<html>` ;
 * les règles correspondantes vivent dans `globals.css`. Tout est lu ici : un
 * réglage changé à l'écran prend effet sur-le-champ, au lieu d'attendre un
 * redémarrage — ou de ne jamais rien changer du tout.
 */
export function useAppearanceClasses(): void {
  const highContrast = useUIStore((s) => s.settings.accessibility.highContrast)
  const reducedMotion = useUIStore((s) => s.settings.accessibility.reducedMotion)
  const keyboardNav = useUIStore((s) => s.settings.accessibility.keyboardNav)
  const largerTouchTargets = useUIStore((s) => s.settings.accessibility.largerTouchTargets)
  const useGradient = useUIStore((s) => s.settings.customTheme.useGradient)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('a11y-high-contrast', highContrast)
    root.classList.toggle('a11y-reduced-motion', reducedMotion)
    root.classList.toggle('a11y-keyboard-nav', keyboardNav)
    root.classList.toggle('a11y-large-touch', largerTouchTargets)
    // Le dégradé est la seule façon dont l'accent se peint : éteint, les
    // surfaces d'accent passent à l'aplat — bulle à soi, boutons, envoyeur.
    root.classList.toggle('theme-flat', !useGradient)
  }, [highContrast, reducedMotion, keyboardNav, largerTouchTargets, useGradient])
}
