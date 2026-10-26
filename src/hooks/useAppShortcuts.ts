import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUIStore } from '@/stores/uiStore'
import { useConversationStore } from '@/stores/conversationStore'
import {
  COMPOSER_INPUT_ID,
  WIRED_SHORTCUTS,
  comboMatches,
  type WiredShortcut,
} from '@/utils/shortcuts'

/**
 * Les gestes clavier globaux, lus dans `settings.keyboardShortcuts` à chaque
 * frappe.
 *
 * Le réglage était écrit et persisté sans jamais être relu : `App.tsx`
 * comparait `e.key === 'k'` en dur, `Ctrl+B`, `Ctrl+,`, `Ctrl+P`,
 * `Ctrl+Flèche`, `Ctrl+I` ne faisaient rien. Ici la combinaison est relue à
 * l'événement, donc un réglage changé dans la page de réglages prend effet
 * sans redémarrage ni ré-abonnement.
 */
export function useAppShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const step = (delta: 1 | -1) => {
      const store = useConversationStore.getState()
      // La liste visible de la page Messages est filtrée aux fils directs :
      // le geste doit suivre cet ordre, sinon il saute sur des conversations
      // que l'utilisateur ne voit pas.
      const list = store.getFilteredConversations().filter((conv) => conv.type === 'direct')
      if (list.length === 0) return
      // Le fil affiché est celui de l'URL : `activeConversationId` n'est à
      // jour qu'après l'effet de ChatView, et un geste parti trop vite aurait
      // sauté deux lignes.
      const fromRoute = location.pathname.match(/^\/conversations\/([^/]+)/)?.[1]
      const current = fromRoute ?? store.activeConversationId
      const at = list.findIndex((conv) => conv.id === current)
      const target = at === -1
        ? (delta === 1 ? list[0] : list[list.length - 1])
        : list[(at + delta + list.length) % list.length]
      if (!target || target.id === current) return
      // `setActiveConversation` n'ouvre pas le fil : la route doit suivre,
      // comme le fait le clic dans la liste.
      store.setActiveConversation(target.id)
      navigate(`/conversations/${target.id}`)
    }

    const actions: Record<WiredShortcut, () => void> = {
      openSearch: () => useUIStore.getState().setSearchOpen(true),
      toggleSidebar: () => useUIStore.getState().toggleSidebar(),
      nextConversation: () => step(1),
      prevConversation: () => step(-1),
      // Les réglages sont déjà une page : y revenir ne doit pas effacer la
      // section où l'utilisateur se trouve.
      openSettings: () => {
        if (location.pathname !== '/settings') navigate('/settings')
      },
      // L'app n'a pas d'écran de profil séparé : la section « profil » de la
      // page de réglages est le seul endroit où l'on se voit soi-même.
      openProfile: () => navigate('/settings?section=profile'),
      focusInput: () => {
        document.getElementById(COMPOSER_INPUT_ID)?.focus()
      },
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Une composition IME en cours avale la touche : rien de global ne doit
      // partir pendant qu'un champ assemble des caractères.
      if (e.isComposing || e.keyCode === 229) return
      const shortcuts = useUIStore.getState().settings.keyboardShortcuts
      for (const name of WIRED_SHORTCUTS) {
        if (!comboMatches(shortcuts[name], e)) continue
        e.preventDefault()
        actions[name]()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, location.pathname])
}
