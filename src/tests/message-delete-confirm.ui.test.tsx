/**
 * Suppression d'un message : demander n'est pas effacer.
 *
 * Les deux entrées du menu à clic droit appelaient le service sans un mot — et
 * la combinaison `deleteMessage` (« Delete »), écrite dans les réglages depuis
 * toujours, restait à l'écart du clavier pour cette raison : une frappe mal
 * placée faisait disparaître un message. Le hook retient la demande, le dialogue
 * l'acquitte, et le mode — « pour tous », « sans trace », « pour moi » — voyage
 * du menu jusqu'au service sans que personne le devine. Un canal ne sait pas
 * effacer sans trace chez les autres : il ne propose donc pas ce mode-là, et le
 * libellé que l'on clique est le mot exact du bouton qui acquiesce.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { MessageDeleteConfirm } from '@/features/chat/components/MessageDeleteConfirm'
import {
  DELETE_MODE_LABEL_KEYS,
  DELETE_MODE_WARNING_KEYS,
  useDeleteConfirmation,
  type DeleteMode,
} from '@/hooks/useDeleteConfirmation'
import { useMessageActionShortcuts } from '@/hooks/useMessageActionShortcuts'
import { useUIStore } from '@/stores/uiStore'
import { MESSAGE_ACTION_SHORTCUTS } from '@/utils/shortcuts'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

const msg = (id: string, overrides: Partial<Message> = {}): Message => ({
  id,
  conversationId: 'fil-1',
  senderId: ME,
  type: 'text',
  content: `texte ${id}`,
  timestamp: 1_700_000_000_000,
  status: 'sent',
  ...overrides,
})

const MODES: DeleteMode[] = ['forEveryone', 'permanently', 'forMe']

const shortcutsBaseline = { ...useUIStore.getState().settings.keyboardShortcuts }

const setShortcut = (name: 'deleteMessage' | 'closeModal', combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  act(() => useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, [name]: combo } }))
}

/** Frappe jouée sur l'élément sous le focus ; `false` = geste revendiqué. */
const press = (key: string, modifiers: Record<string, boolean> = {}) => {
  const origin = (document.activeElement ?? document.body) as Element
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...modifiers })
  let keptByTheBrowser = true
  act(() => { keptByTheBrowser = origin.dispatchEvent(event) })
  return keptByTheBrowser
}

const source = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

beforeEach(() => {
  // framer-motion mesure ses images clés en ouvrant un panneau : jsdom n'a pas
  // de fenêtre qui défile, et la plainte noierait le bilan de la suite.
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...shortcutsBaseline } })
})

// ─── Le hook : la demande d'un côté, l'exécution de l'autre ──────────────────

interface PanelProps {
  run: (message: Message, mode: DeleteMode) => void
  onAsk?: (message: Message, mode: DeleteMode) => void
}

function Panel({ run, onAsk }: PanelProps) {
  const ask = onAsk ?? run
  const { pending, requestDelete, cancelDelete, confirmDelete } = useDeleteConfirmation(ask)
  return (
    <>
      {MODES.map((mode) => (
        <button key={mode} onClick={() => requestDelete(msg('m1'), mode)}>{`demander:${mode}`}</button>
      ))}
      <span data-testid="etat">{pending ? `${pending.message.id}:${pending.mode}` : 'rien'}</span>
      <button onClick={confirmDelete}>acquiescer</button>
      <button onClick={cancelDelete}>renoncer</button>
    </>
  )
}

const etat = () => screen.getByTestId('etat').textContent

describe('demander, puis acquiescer', () => {
  it('ne fait rien au moment où la suppression est demandée', () => {
    const run = vi.fn()
    render(<Panel run={run} />)

    fireEvent.click(screen.getByText('demander:permanently'))

    expect(etat()).toBe('m1:permanently')
    expect(run).not.toHaveBeenCalled()
  })

  it('n’exécute qu’à l’acquiescement, avec le mode qui a été demandé', () => {
    const run = vi.fn()
    render(<Panel run={run} />)
    fireEvent.click(screen.getByText('demander:forMe'))
    fireEvent.click(screen.getByText('acquiescer'))

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 'forMe')
    expect(etat()).toBe('rien')
  })

  it('ne rend pas la même demande rejouable', () => {
    const run = vi.fn()
    render(<Panel run={run} />)
    fireEvent.click(screen.getByText('demander:forEveryone'))
    fireEvent.click(screen.getByText('acquiescer'))
    fireEvent.click(screen.getByText('acquiescer'))

    expect(run).toHaveBeenCalledOnce()
  })

  it('renoncer n’efface rien', () => {
    const run = vi.fn()
    render(<Panel run={run} />)
    fireEvent.click(screen.getByText('demander:permanently'))
    fireEvent.click(screen.getByText('renoncer'))

    expect(run).not.toHaveBeenCalled()
    expect(etat()).toBe('rien')
  })

  it('ne retient que la demande la plus récente', () => {
    const run = vi.fn()
    render(<Panel run={run} />)
    fireEvent.click(screen.getByText('demander:forEveryone'))
    fireEvent.click(screen.getByText('demander:forMe'))

    expect(etat()).toBe('m1:forMe')
    fireEvent.click(screen.getByText('acquiescer'))
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 'forMe')
    expect(run).toHaveBeenCalledOnce()
  })

  it('lit le geste en cours, pas la closure de la demande', () => {
    // Une vue recrée sa callback à chaque rendu : l'acquiescement doit appeler
    // celle d'aujourd'hui, non celle qui était posée quand la demande est née.
    const premiere = vi.fn()
    const seconde = vi.fn()
    const { rerender } = render(<Panel run={premiere} />)
    fireEvent.click(screen.getByText('demander:permanently'))
    rerender(<Panel run={seconde} />)
    fireEvent.click(screen.getByText('acquiescer'))

    expect(seconde).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 'permanently')
    expect(premiere).not.toHaveBeenCalled()
  })

  it('ne fait rien si l’acquiescement arrive sans demande', () => {
    const run = vi.fn()
    render(<Panel run={run} />)
    fireEvent.click(screen.getByText('acquiescer'))

    expect(run).not.toHaveBeenCalled()
  })
})

// ─── Le dialogue : trois modes, trois promesses ──────────────────────────────

interface DialogProps {
  mode: DeleteMode
  onCancel?: () => void
  onConfirm?: () => void
}

/** Le dialogue posé seul, pour lire ce qu'il annonce et ce qu'il appelle. */
const Shown = ({ mode, onCancel = () => {}, onConfirm = () => {} }: DialogProps) => (
  <MessageDeleteConfirm mode={mode} onCancel={onCancel} onConfirm={onConfirm} />
)

/** Le dialogue ouvert depuis un déclencheur qui tient déjà le focus — le cas
 *  d'un clavier : c'est là que le focus doit revenir à la fermeture. */
function FromTrigger({ mode = 'forEveryone', onCancel = () => {} }: Partial<DialogProps>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>ouvrir</button>
      {open && (
        <MessageDeleteConfirm
          mode={mode}
          onCancel={() => { onCancel(); setOpen(false) }}
          onConfirm={() => setOpen(false)}
        />
      )}
    </>
  )
}

const dialog = () => screen.getByRole('dialog')

describe('dialogue de confirmation', () => {
  it('est un dialogue nommé, décrit par ce qu’il va vraiment effacer', () => {
    render(<Shown mode="forEveryone" />)

    expect(dialog()).toHaveAttribute('aria-modal', 'true')
    expect(dialog()).toHaveAccessibleName('chat.deleteMessageConfirm')
    expect(dialog()).toHaveAccessibleDescription('chat.deleteForEveryoneWarning')
  })

  it('promet trois choses différentes selon le mode', () => {
    for (const mode of MODES) {
      cleanup()
      render(<Shown mode={mode} />)
      expect(dialog()).toHaveAccessibleDescription(DELETE_MODE_WARNING_KEYS[mode])
      expect(within(dialog()).getByRole('button', { name: DELETE_MODE_LABEL_KEYS[mode] })).toBeInTheDocument()
    }
    // Trois promesses distinctes : un mode qui reprendrait le texte d'un autre
    // n'avertirait pas de ce qu'il fait vraiment.
    expect(new Set(MODES.map((mode) => DELETE_MODE_WARNING_KEYS[mode])).size).toBe(3)
    expect(new Set(MODES.map((mode) => DELETE_MODE_LABEL_KEYS[mode])).size).toBe(3)
  })

  it('le bouton du geste est le seul qui exécute', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<Shown mode="permanently" onCancel={onCancel} onConfirm={onConfirm} />)

    fireEvent.click(within(dialog()).getByRole('button', { name: 'chat.deletePermanently' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('renoncer est un bouton qui n’efface rien', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<Shown mode="forEveryone" onCancel={onCancel} onConfirm={onConfirm} />)

    fireEvent.click(within(dialog()).getByRole('button', { name: 'common.cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('referme sur la combinaison de fermeture réglée, pas sur une touche en dur', () => {
    const onCancel = vi.fn()
    setShortcut('closeModal', 'Ctrl+X')
    render(<Shown mode="forMe" onCancel={onCancel} />)
    act(() => dialog().focus())

    press('Escape')
    expect(onCancel).not.toHaveBeenCalled()
    expect(dialog()).toBeInTheDocument()

    press('x', { ctrlKey: true })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('rend le focus à ce qui l’avait ouvert', () => {
    render(<FromTrigger mode="forEveryone" />)
    act(() => screen.getByText('ouvrir').focus())
    fireEvent.click(screen.getByText('ouvrir'))
    expect(dialog()).toHaveFocus()

    fireEvent.click(within(dialog()).getByRole('button', { name: 'common.cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('ouvrir')).toHaveFocus()
  })

  it('garde Tab dans le panneau, des deux côtés', () => {
    render(<Shown mode="forEveryone" />)
    const buttons = within(dialog()).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(dialog()).toHaveFocus()

    act(() => buttons[1]?.focus())
    press('Tab')
    expect(buttons[0]).toHaveFocus()

    act(() => buttons[0]?.focus())
    press('Tab', { shiftKey: true })
    expect(buttons[1]).toHaveFocus()
  })

  it('un clic hors du panneau renonce, un clic dedans ne fait rien', () => {
    const onCancel = vi.fn()
    render(<Shown mode="forEveryone" onCancel={onCancel} />)

    fireEvent.click(within(dialog()).getByRole('heading', { name: 'chat.deleteMessageConfirm' }))
    expect(onCancel).not.toHaveBeenCalled()

    // Le fond est l'ancêtre direct du panneau : sa propre cible le ferme.
    fireEvent.click(dialog().parentElement as HTMLElement)
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

// ─── La touche réglée `deleteMessage` ────────────────────────────────────────

const row = (id: string) => document.querySelector<HTMLElement>(`[data-message-id="${id}"]`)

function Thread({ messages, onDelete }: { messages: Message[]; onDelete?: (message: Message) => void }) {
  useMessageActionShortcuts({ messages, ownSenderId: ME, handlers: { onDelete } })
  return (
    <>
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} isOwn={message.senderId === ME} />
      ))}
    </>
  )
}

const focusRow = (id: string) => {
  const element = row(id)
  if (!element) throw new Error(`aucune rangée pour ${id}`)
  act(() => element.focus())
}

describe('touche réglée de suppression', () => {
  it('demande sur la rangée sous le focus, sans effacer', () => {
    const onDelete = vi.fn()
    render(<Thread messages={[msg('m1'), msg('m2')]} onDelete={onDelete} />)
    focusRow('m2')

    expect(MESSAGE_ACTION_SHORTCUTS).toContain('deleteMessage')
    expect(press('Delete')).toBe(false)
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'm2' }))
  })

  it('suit la combinaison écrite plutôt que « Delete » en dur', () => {
    const onDelete = vi.fn()
    setShortcut('deleteMessage', 'Ctrl+Shift+Backspace')
    render(<Thread messages={[msg('m1')]} onDelete={onDelete} />)
    focusRow('m1')

    expect(press('Delete')).toBe(true)
    expect(onDelete).not.toHaveBeenCalled()

    expect(press('Backspace', { ctrlKey: true, shiftKey: true })).toBe(false)
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('s’éteint quand sa combinaison est vide', () => {
    const onDelete = vi.fn()
    setShortcut('deleteMessage', '')
    render(<Thread messages={[msg('m1')]} onDelete={onDelete} />)
    focusRow('m1')

    expect(press('Delete')).toBe(true)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('ne revendique pas la touche sans cible', () => {
    const onDelete = vi.fn()
    render(<Thread messages={[msg('m1')]} onDelete={onDelete} />)

    expect(press('Delete')).toBe(true)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('ne revendique pas la touche si la vue n’a rien à demander', () => {
    // Canal en écriture fermée, message d'un autre : pas de gestionnaire. La
    // frappe doit rester au navigateur plutôt que de s'éteindre dans le vide.
    render(<Thread messages={[msg('m1')]} />)
    focusRow('m1')

    expect(press('Delete')).toBe(true)
  })

  it('laisse la main à un champ de saisie', () => {
    const onDelete = vi.fn()
    render(
      <>
        <textarea data-testid="champ" />
        <Thread messages={[msg('m1')]} onDelete={onDelete} />
      </>,
    )
    screen.getByTestId('champ').focus()

    expect(press('Delete')).toBe(true)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('ne redemande pas pendant que le dialogue est posé', () => {
    // Le panneau de confirmation est déjà ouvert : une frappe de plus ne doit
    // pas rallonger la demande, le dialogue tient l'écran.
    const onDelete = vi.fn()
    const onCancel = vi.fn()
    render(
      <>
        <Shown mode="forEveryone" onCancel={onCancel} />
        <Thread messages={[msg('m1')]} onDelete={onDelete} />
      </>,
    )
    focusRow('m1')

    expect(press('Delete')).toBe(true)
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeInTheDocument()
  })
})

// ─── Le menu de la bulle ne propose que ce que la vue fait ───────────────────

const openMenu = (id: string) => {
  const element = row(id)
  if (!element) throw new Error(`aucune rangée pour ${id}`)
  fireEvent.contextMenu(element)
}

describe('entrées de suppression du menu', () => {
  it('donne à chaque entrée le libellé et le mode du geste correspondant', () => {
    const onDelete = vi.fn()
    render(
      <MessageBubble
        message={msg('m1')}
        isOwn
        onDelete={onDelete}
        deleteModes={['forEveryone', 'permanently']}
      />,
    )
    openMenu('m1')

    expect(within(row('m1') as HTMLElement).getByRole('button', { name: 'chat.deleteForEveryone' })).toBeInTheDocument()
    fireEvent.click(within(row('m1') as HTMLElement).getByRole('button', { name: 'chat.deletePermanently' }))

    // Le mode traverse le menu : la vue n'a pas à deviner ce qui a été cliqué.
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 'permanently')
  })

  it('dans un canal, remplace « sans trace » par « pour moi »', () => {
    const onDelete = vi.fn()
    render(
      <MessageBubble
        message={msg('m1')}
        isOwn
        onDelete={onDelete}
        deleteModes={['forEveryone', 'forMe']}
      />,
    )
    openMenu('m1')

    expect(within(row('m1') as HTMLElement).getByRole('button', { name: 'chat.deleteForMe' })).toBeInTheDocument()
    expect(within(row('m1') as HTMLElement).queryByRole('button', { name: 'chat.deletePermanently' })).toBeNull()

    fireEvent.click(within(row('m1') as HTMLElement).getByRole('button', { name: 'chat.deleteForMe' }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 'forMe')
  })

  it('n’invente aucune suppression que la vue n’a pas demandée', () => {
    const onDelete = vi.fn()
    render(<MessageBubble message={msg('m1')} isOwn onDelete={onDelete} />)
    openMenu('m1')

    for (const mode of MODES) {
      expect(within(row('m1') as HTMLElement).queryByRole('button', { name: DELETE_MODE_LABEL_KEYS[mode] })).toBeNull()
    }
  })

  it('signale chaque suppression comme destructive', () => {
    render(
      <MessageBubble
        message={msg('m1')}
        isOwn
        onDelete={() => {}}
        deleteModes={MODES}
      />,
    )
    openMenu('m1')

    for (const mode of MODES) {
      const item = within(row('m1') as HTMLElement).getByRole('button', { name: DELETE_MODE_LABEL_KEYS[mode] })
      expect(item.className).toContain('text-red-400')
    }
  })

  it('ne propose rien sur le message d’un autre', () => {
    render(
      <MessageBubble
        message={msg('m1', { senderId: PEER })}
        isOwn={false}
        onDelete={() => {}}
        deleteModes={MODES}
      />,
    )
    openMenu('m1')

    for (const mode of MODES) {
      expect(within(row('m1') as HTMLElement).queryByRole('button', { name: DELETE_MODE_LABEL_KEYS[mode] })).toBeNull()
    }
  })

  it('menu et dialogue lisent la même table de libellés', () => {
    const bubble = source('src/features/chat/components/MessageBubble.tsx')
    const confirm = source('src/features/chat/components/MessageDeleteConfirm.tsx')
    const hook = source('src/hooks/useDeleteConfirmation.ts')

    expect(bubble).toContain('DELETE_MODE_LABEL_KEYS')
    expect(confirm).toContain('DELETE_MODE_LABEL_KEYS')
    // Le mot du geste n'est écrit qu'une fois, à côté du mode qu'il nomme.
    expect(bubble).not.toMatch(/t\('chat\.delete(ForEveryone|ForMe|Permanently)'/)
    expect(confirm).not.toMatch(/t\('chat\.delete(ForEveryone|ForMe|Permanently)'/)
    expect(hook).toContain("permanently: 'chat.deletePermanently'")
    expect(hook).toContain("forMe: 'chat.deleteForMe'")
  })
})

// ─── Les deux vues passent par le dialogue ───────────────────────────────────

describe('câblage des vues', () => {
  const chatView = source('src/features/chat/ChatView.tsx')
  const groupView = source('src/features/groups/components/GroupView.tsx')

  it('propose au fil 1:1 les deux gestes que le service fait', () => {
    expect(chatView).toContain('onDelete={requestDelete}')
    expect(chatView).toContain("deleteModes={['forEveryone', 'permanently']}")
  })

  it('ne promet pas à un canal un effacement sans trace', () => {
    expect(groupView).toContain('onDelete={requestDelete}')
    expect(groupView).toContain("deleteModes={['forEveryone', 'forMe']}")
    expect(groupView).not.toMatch(/deleteModes=\{[^}]*permanently/)
  })

  it('ne joint le service qu’une fois acquiescée', () => {
    for (const [file, call] of [
      [chatView, 'chatService.deleteMessage('],
      [chatView, 'chatService.deleteMessagePermanently('],
      [groupView, 'groupService.deleteGroupMessage('],
      [groupView, 'groupService.deleteGroupMessageForMe('],
    ] as const) {
      expect(file.match(new RegExp(call.replace(/[.()]/g, '\\$&'), 'g'))).toHaveLength(1)
      // L'appel unique se trouve après l'ouverture du hook : dans son geste.
      expect(file.indexOf(call)).toBeGreaterThan(file.indexOf('useDeleteConfirmation('))
    }
  })

  it('demande le geste clavier par le même chemin que la souris', () => {
    expect(chatView).toContain("onDelete: (message) => requestDelete(message, 'forEveryone')")
    expect(groupView).toContain("onDelete: (message) => requestDelete(message, 'forEveryone')")
  })

  it('laisse la bulle et le dialogue hors des services', () => {
    expect(source('src/features/chat/components/MessageBubble.tsx')).not.toMatch(/chatService|groupService/)
    expect(source('src/features/chat/components/MessageDeleteConfirm.tsx')).not.toMatch(/chatService|groupService/)
  })

  it('ne laisse aucune des clés du dialogue sans texte dans le catalogue', () => {
    const fr = source('src/i18n/locales/fr.ts')
    for (const mode of MODES) {
      expect(fr).toContain(`"${DELETE_MODE_LABEL_KEYS[mode]}"`)
      expect(fr).toContain(`"${DELETE_MODE_WARNING_KEYS[mode]}"`)
    }
    expect(fr).toContain('"chat.deleteMessageConfirm"')
  })
})
