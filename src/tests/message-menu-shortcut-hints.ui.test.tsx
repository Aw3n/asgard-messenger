/**
 * Le menu d'un message lit les gestes réglés à l'écran.
 *
 * L'éditeur de raccourcis montre quinze combinaisons dans les réglages, mais
 * rien, là où l'action se joue, ne disait à l'utilisateur quel geste la fait :
 * une touche changée restait invisible tant qu'on ne rouvrait pas la page. Trois
 * entrées du menu portent donc l'indice de la combinaison — répondre, copier,
 * transférer — et « modifier » n'en porte pas : son geste vise le dernier
 * message modifiable de l'expéditeur, pas celui sur lequel le menu est ouvert.
 *
 * L'indice serait un mensonge si la frappe n'agissait pas sur le message dont le
 * menu est ouvert : l'ouverture pose donc le focus sur la rangée, et le test le
 * vérifie par le geste lui-même, sur deux messages rendus côte à côte.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { useMessageActionShortcuts } from '@/hooks/useMessageActionShortcuts'
import { useUIStore } from '@/stores/uiStore'
import type { KeyboardShortcuts } from '@/types/ui'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

const makeMessage = (id: string, senderId: string): Message => ({
  id,
  conversationId: 'conversation-1',
  senderId,
  type: 'text',
  content: `message ${id}`,
  timestamp: 1_700_000_000_000,
  status: 'sent',
})

/** Deux rangées : l'une à l'autre, l'autre à moi — de quoi confondre une cible. */
const THREAD = [makeMessage('m-1', PEER), makeMessage('m-2', ME)]

/** Deux bulles focalisables et le lecteur de gestes du fil, comme dans ChatView. */
function Thread({ onAction }: { onAction: (message: Message) => void }) {
  useMessageActionShortcuts({ messages: THREAD, ownSenderId: ME, handlers: { onReply: onAction } })
  return (
    <>
      {THREAD.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isOwn={message.senderId === ME}
          onReply={onAction}
          onForward={onAction}
          onEdit={onAction}
        />
      ))}
    </>
  )
}

const rows = () => screen.getAllByRole('group', { name: 'chat.messageActions' })

const openMenuOf = (messageId: string) => {
  const row = rows().find((node) => node.dataset.messageId === messageId)
  if (!row) throw new Error(`Aucune rangée pour ${messageId}`)
  fireEvent.contextMenu(row, { clientX: 120, clientY: 80 })
}

/** Le bouton d'entrée du menu, repéré par son libellé. */
const item = (label: string) => screen.getByText(label).closest('button') as HTMLElement

const setShortcuts = (shortcuts: KeyboardShortcuts) => {
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...shortcuts } })
}

const changeOne = (name: keyof KeyboardShortcuts, combo: string) => {
  setShortcuts({ ...useUIStore.getState().settings.keyboardShortcuts, [name]: combo })
}

const baselineShortcuts = { ...useUIStore.getState().settings.keyboardShortcuts }

afterEach(() => {
  cleanup()
  setShortcuts(baselineShortcuts)
})

describe('indice de geste sur les actions du menu', () => {
  it('lit la combinaison réglée en face de chaque action', () => {
    render(<Thread onAction={() => {}} />)
    openMenuOf('m-1')
    expect(item('chat.reply')).toHaveTextContent('Ctrl + R')
    expect(item('common.copy')).toHaveTextContent('Ctrl + C')
    expect(item('chat.forward')).toHaveTextContent('Ctrl + F')
  })

  it('suit une combinaison changée sans refermer le menu', () => {
    render(<Thread onAction={() => {}} />)
    openMenuOf('m-1')
    act(() => { changeOne('replyToMessage', 'Ctrl+Alt+T') })
    expect(item('chat.reply')).toHaveTextContent('Ctrl + Alt + T')
  })

  it('ne dessine aucun indice pour un geste désactivé', () => {
    changeOne('copyMessage', '')
    render(<Thread onAction={() => {}} />)
    openMenuOf('m-1')
    // Pas d'indice vide : une colonne vide ferait pousser le menu et décalerait
    // les libellés, comme si le geste existait encore sous une autre touche.
    expect(item('common.copy').textContent).toBe('common.copy')
    expect(item('common.copy').children).toHaveLength(1)
    expect(screen.queryByText('Ctrl + C')).not.toBeInTheDocument()
  })

  it('ne promet pas le geste d’édition, qui vise un autre message', () => {
    render(<Thread onAction={() => {}} />)
    openMenuOf('m-2')
    // « Ctrl+E » édite le dernier message modifiable de l'expéditeur : l'écrire
    // en face d'une entrée qui porte sur le message du menu serait une
    // seconde promesse fausse.
    expect(item('chat.editMessage').textContent).toBe('chat.editMessage')
    expect(item('chat.editMessage').children).toHaveLength(1)
    expect(screen.queryByText('Ctrl + E')).not.toBeInTheDocument()
  })
})

describe('le menu et la frappe portent sur la même rangée', () => {
  it('pose le focus sur la rangée dont le menu s’ouvre', () => {
    render(<Thread onAction={() => {}} />)
    const [first, second] = rows()
    act(() => { first.focus() })
    openMenuOf('m-2')
    expect(document.activeElement).toBe(second)
  })

  it('rend la frappe réglée sur le message du menu ouvert', () => {
    const replied: Message[] = []
    render(<Thread onAction={(message) => replied.push(message)} />)
    // Sans ouverture focalisée, « Ctrl+R » aurait répondu au message tenu par le
    // curseur clavier — ici le premier — alors que le menu était ouvert sur l'autre.
    openMenuOf('m-2')
    fireEvent.keyDown(window, { key: 'r', ctrlKey: true })
    expect(replied.map((message) => message.id)).toEqual(['m-2'])
  })
})
