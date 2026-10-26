/**
 * L'écran des gestes clavier réglés.
 *
 * `settings.keyboardShortcuts` portait quinze combinaisons que le code lit
 * depuis plusieurs chantiers — l'écouteur global, le composeur, les rangées de
 * message, les dialogues — sans qu'aucun écran ne les montre ni ne les laisse
 * changer. La carte Accessibilité promettait même d'« afficher les raccourcis
 * clavier » : elle n'affichait qu'un commutateur de styles de focus.
 *
 * Le doigt sur la touche, ici, ne déclenche rien : la frappe est prise en
 * phase de capture avant l'écouteur global, donc régler « Ctrl+K » sur une
 * autre action n'ouvre pas la recherche pendant qu'on l'écrit. Une combinaison
 * refusée se voit dire pourquoi — un geste déjà réglé ailleurs, ou Tab, qui
 * mène le focus dans toute l'interface.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useUIStore } from '@/stores/uiStore'
import type { KeyboardShortcuts } from '@/types/ui'
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  SHORTCUT_GROUPS,
  SHORTCUT_LABEL_KEYS,
  SHORTCUT_NAMES,
  comboFromKeypress,
  findShortcutConflict,
  formatCombo,
  isReservedCombo,
  toAriaKeyShortcuts,
  type ShortcutName,
} from '@/utils/shortcuts'

interface ShortcutRowProps {
  name: ShortcutName
  shortcuts: KeyboardShortcuts
  onApply: (name: ShortcutName, combo: string) => void
}

const iconButtonClass =
  'flex items-center justify-center w-7 h-7 rounded-lg border border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt hover:text-asgard-text-primary transition-colors'

const ShortcutRow: React.FC<ShortcutRowProps> = ({ name, shortcuts, onApply }) => {
  const { t } = useTranslation()
  const [listening, setListening] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const labelId = React.useId()
  const valueId = React.useId()
  const hintId = React.useId()

  // Les valeurs et le traducteur lus au moment de la frappe : ré-abonner
  // l'écouteur à chaque rendu de la page perdrait la capture en cours.
  const latest = useRef({ name, shortcuts, onApply, t })
  latest.current = { name, shortcuts, onApply, t }

  useEffect(() => {
    if (!listening) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Une composition IME assemble des caractères : rien à régler là-dessus.
      if (event.isComposing || event.keyCode === 229) return
      const { name: action, shortcuts: current, onApply: apply, t: translate } = latest.current
      // La frappe est pour l'éditeur, jamais pour l'action réglée.
      event.preventDefault()
      event.stopPropagation()

      // Échap seul referme la capture : la combinaison affichée reste au
      // clavier, sinon l'utilisateur n'aurait aucun moyen de sortir de l'écoute.
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        setListening(false)
        setRefused(null)
        return
      }

      const combo = comboFromKeypress(event)
      // Un modificateur tenu seul, ou une touche sans signe écrit : on attend la suivante.
      if (!combo) return

      if (isReservedCombo(combo)) {
        setRefused(translate('settings.shortcutReserved'))
        return
      }
      const holder = findShortcutConflict(current, action, combo)
      if (holder) {
        setRefused(translate('settings.shortcutTaken', { action: translate(SHORTCUT_LABEL_KEYS[holder]) }))
        return
      }

      setRefused(null)
      setListening(false)
      apply(action, combo)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [listening])

  const value = shortcuts[name]
  // Ce que l'écran écrit est ce que le code reconnaît : une chaîne du magasin
  // qu'aucune frappe ne produirait — un fichier de réglages griffonné à la
  // main — s'annonce désactivée, comme elle se comporte.
  const shown = formatCombo(value)
  const differsFromDefault = value !== DEFAULT_KEYBOARD_SHORTCUTS[name]

  const abandon = () => {
    setRefused(null)
    setListening(false)
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <p id={labelId} className="text-sm font-medium text-asgard-text-primary">
        {t(SHORTCUT_LABEL_KEYS[name])}
      </p>
      <div className="flex items-center gap-2">
        <p id={hintId} aria-live="polite" className="max-w-[15rem] text-right text-xs text-asgard-text-muted">
          {refused ?? (listening ? t('settings.shortcutListening') : '')}
        </p>
        {differsFromDefault && (
          <button
            type="button"
            aria-label={t('settings.shortcutReset')}
            onClick={() => onApply(name, DEFAULT_KEYBOARD_SHORTCUTS[name])}
            className={iconButtonClass}
          >
            <Icon name="refresh" size={14} />
          </button>
        )}
        {shown && (
          <button
            type="button"
            aria-label={t('settings.shortcutClear')}
            onClick={() => {
              abandon()
              onApply(name, '')
            }}
            className={iconButtonClass}
          >
            <Icon name="close" size={14} />
          </button>
        )}
        <button
          type="button"
          id={valueId}
          aria-labelledby={`${labelId} ${valueId}`}
          aria-keyshortcuts={toAriaKeyShortcuts(value)}
          onClick={() => {
            setRefused(null)
            setListening((on) => !on)
          }}
          onBlur={() => setListening(false)}
          className={`min-w-[7rem] px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
            listening
              ? 'border-asgard-glacier bg-asgard-nordic/20 text-asgard-glacier'
              : 'border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt hover:text-asgard-text-primary'
          }`}
        >
          {shown ?? t('settings.shortcutDisabled')}
        </button>
      </div>
    </div>
  )
}

/**
 * Tous les gestes réglés, groupés selon l'endroit où ils se jouent, plus le
 * retour aux combinaisons du premier lancement.
 */
export const ShortcutsManager: React.FC = () => {
  const { t } = useTranslation()
  const shortcuts = useUIStore((s) => s.settings.keyboardShortcuts)
  const updateSettings = useUIStore((s) => s.updateSettings)

  const apply = useCallback((name: ShortcutName, combo: string) => {
    const current = useUIStore.getState().settings.keyboardShortcuts
    updateSettings({ keyboardShortcuts: { ...current, [name]: combo } })
  }, [updateSettings])

  const changedCount = SHORTCUT_NAMES.filter((name) => shortcuts[name] !== DEFAULT_KEYBOARD_SHORTCUTS[name]).length

  return (
    <div className="space-y-6">
      {SHORTCUT_GROUPS.map((group) => {
        const titleId = `shortcuts-${group.id}`
        return (
          <div key={group.id}>
            <h4 id={titleId} className="text-xs font-semibold uppercase tracking-wider text-asgard-text-muted mb-1">
              {t(group.titleKey)}
            </h4>
            <div className="divide-y divide-asgard-border">
              {group.names.map((name) => (
                <ShortcutRow key={name} name={name} shortcuts={shortcuts} onApply={apply} />
              ))}
            </div>
          </div>
        )
      })}

      {changedCount > 0 && (
        <div className="flex justify-end pt-1">
          <Button variant="secondary" size="sm" onClick={() => updateSettings({ keyboardShortcuts: { ...DEFAULT_KEYBOARD_SHORTCUTS } })}>
            {t('settings.shortcutsResetAll')}
          </Button>
        </div>
      )}
    </div>
  )
}
