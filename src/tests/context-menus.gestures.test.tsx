/**
 * Cinq menus contextuels, un seul geste.
 *
 * Chaque liste avait sa copie du même effect — conversations, groupes, canaux —
 * avec un « Escape » écrit en dur : depuis que la touche de fermeture se règle
 * dans les paramètres, la changer laissait ces menus sans aucune sortie au
 * clavier. Le menu du message suivait le réglage mais ne se parcourait pas aux
 * flèches ; celui de la pièce jointe n'avait ni rôle, ni flèches, ni même une
 * touche pour se refermer, et ne s'ouvrait pas sans souris.
 *
 * Ces tests tiennent les cinq sur le même contrat : `role="menu"` et ses
 * `menuitem`, la combinaison réglée qui referme et rend le focus, les flèches
 * qui entrent dans le menu et en font le tour, `Tab` qui reste dedans, le clic
 * extérieur, et une composition IME qui n'est jamais prise pour un geste.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { Contact, Conversation, Group, Message, MessageAttachment } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

// L'avatar paresseux s'abonne à l'entrée dans le champ de vision : jsdom n'a pas
// cette horloge, et la mesure de chaque ligne n'apprend rien ici.
vi.mock('@/components/ui/Avatar', () => ({ Avatar: () => React.createElement('div', { 'data-testid': 'avatar' }) }))

// Virtuoso ne mesure aucune hauteur en jsdom : les lignes se rendent à plat.
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent }: {
    data: unknown[]
    itemContent: (index: number, item: unknown) => React.ReactNode
  }) => React.createElement(
    'div',
    null,
    data.map((item, index) => React.createElement('div', { key: index }, itemContent(index, item))),
  ),
}))

import { ConversationList } from '@/features/chat/components/ConversationList'
import { GroupList } from '@/features/groups/components/GroupList'
import { ChannelList } from '@/features/groups/components/ChannelList'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { fileService } from '@/services/FileService'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useNetworkStore } from '@/stores/networkStore'
import { useUIStore } from '@/stores/uiStore'
import { DEFAULT_KEYBOARD_SHORTCUTS } from '@/utils/shortcuts'

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)
const GROUP_ID = 'groupe-abcdef123456'
const REBOUND = 'Ctrl+Shift+X'

const permissions: Group['channels'][number]['permissions'] = {
  send: ['member'],
  read: ['member'],
  manage: ['admin'],
}

const group: Group = {
  id: GROUP_ID,
  name: 'Équipe',
  members: [],
  channels: [
    { id: 'ch-general', groupId: GROUP_ID, name: 'général', type: 'text', position: 0, permissions, unreadCount: 0 },
    { id: 'ch-random', groupId: GROUP_ID, name: 'aléatoire', type: 'text', position: 1, permissions, unreadCount: 2 },
  ],
  createdAt: 1,
  ownerId: ME,
  isPublic: false,
  maxMembers: 100,
}

const conversation: Conversation = {
  id: 'conv-direct',
  type: 'direct',
  participantId: PEER,
  unreadCount: 2,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
}

const contact: Contact = {
  publicKey: PEER,
  displayName: 'Bob',
  status: 'online',
  relation: 'contact',
  verified: true,
  addedAt: 1,
}

const message: Message = {
  id: 'm1',
  conversationId: 'conv-direct',
  senderId: ME,
  type: 'text',
  content: 'salut',
  timestamp: 1_700_000_000_000,
  status: 'sent',
}

const attachment: MessageAttachment = {
  id: 'att-1',
  type: 'document',
  name: 'report.pdf',
  size: 2048,
  mimeType: 'application/pdf',
  blobKey: 'blob-1',
}

const documentRow = () => screen.getByText('report.pdf').closest('[tabindex="-1"]') as HTMLElement

interface Surface {
  label: string
  mount: () => void
  trigger: () => HTMLElement
}

const surfaces: Surface[] = [
  {
    label: 'liste des conversations',
    mount: () => {
      render(<MemoryRouter><ConversationList /></MemoryRouter>)
    },
    trigger: () => screen.getByText('Bob').closest('button') as HTMLElement,
  },
  {
    label: 'liste des groupes',
    mount: () => {
      render(<GroupList onCreateGroup={() => {}} />)
    },
    trigger: () => screen.getByText('Équipe').closest('button') as HTMLElement,
  },
  {
    label: 'liste des canaux',
    mount: () => {
      render(<ChannelList />)
    },
    trigger: () => screen.getByText('général').closest('button') as HTMLElement,
  },
  {
    label: 'menu du message',
    mount: () => {
      render(<MessageBubble message={message} isOwn onDelete={vi.fn()} deleteModes={['forMe']} />)
    },
    trigger: () => screen.getByRole('group', { name: 'chat.messageActions' }),
  },
  {
    label: 'menu de la pièce jointe',
    mount: () => {
      render(
        <FileAttachment
          attachment={attachment}
          isOwn
          messageId="m1"
          conversationId="conv-direct"
        />,
      )
    },
    trigger: documentRow,
  },
]

/** Les entrées que le clavier peut réellement atteindre, dans l'ordre du DOM. */
const reachableItems = (): HTMLElement[] =>
  Array.from(screen.getByRole('menu').querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'))

const menuClosed = () => screen.queryByRole('menu') === null

const openWithMouse = (surface: Surface): HTMLElement => {
  surface.mount()
  const trigger = surface.trigger()
  fireEvent.contextMenu(trigger)
  return trigger
}

const openWithKeyboard = (surface: Surface): HTMLElement => {
  surface.mount()
  const trigger = surface.trigger()
  act(() => trigger.focus())
  fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })
  return trigger
}

const bindCloseKey = (combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  act(() => {
    useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, closeModal: combo } })
  })
}

let liveUrl: MockInstance<typeof fileService.isLiveUrl>

beforeEach(() => {
  useConversationStore.setState({
    conversations: { [conversation.id]: conversation },
    drafts: {},
    activeConversationId: null,
    filter: {},
  })
  useContactStore.setState({ contacts: { [PEER]: contact } })
  useGroupStore.setState({
    groups: { [GROUP_ID]: group },
    activeGroupId: GROUP_ID,
    activeChannelId: 'ch-general',
    searchQuery: '',
    channelTyping: {},
  })
  useNetworkStore.setState({ typingUsers: {} })
  liveUrl = vi.spyOn(fileService, 'isLiveUrl').mockReturnValue(true)
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
})

afterEach(() => {
  cleanup()
  // Pas de `vi.restoreAllMocks()` : il effacerait les implémentations du pont
  // `window.asgard` posées par setup.ts et casserait la suite suivante.
  liveUrl.mockRestore()
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
})

describe.each(surfaces)('$label', (surface) => {
  it('s’ouvre en menu nommé, avec ses entrées', () => {
    openWithMouse(surface)

    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    // Une liste vide passerait toutes les assertions de navigation à vide.
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(0)
  })

  it('se ferme avec la touche réglée', async () => {
    openWithMouse(surface)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(menuClosed)
  })

  it('suit le réglage : seule la combinaison annoncée referme', async () => {
    openWithMouse(surface)
    bindCloseKey(REBOUND)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true })
    await waitFor(menuClosed)
  })

  it('geste éteint : le clavier ne referme plus, la souris si', async () => {
    openWithMouse(surface)
    bindCloseKey('')

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true })
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.click(document.body)
    await waitFor(menuClosed)
  })

  it('laisse entrer et circuler les flèches', () => {
    openWithMouse(surface)
    const items = reachableItems()
    expect(items.length).toBeGreaterThan(0)

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    // Depuis la première entrée, la flèche du haut fait le tour par la dernière.
    expect(document.activeElement).toBe(items[items.length - 1])
  })

  it('garde Tab dans le menu', () => {
    openWithMouse(surface)
    const items = reachableItems()
    act(() => items[0].focus())

    // false = la frappe a été revendiquée : le focus n'ira pas dans la page.
    expect(fireEvent.keyDown(window, { key: 'Tab' })).toBe(false)
    expect(screen.getByRole('menu').contains(document.activeElement)).toBe(true)
  })

  it('ouvert au clavier, place le focus dedans et le rend au déclencheur', async () => {
    const trigger = openWithKeyboard(surface)
    expect(document.activeElement).toBe(reachableItems()[0])

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(menuClosed)
    expect(document.activeElement).toBe(trigger)
  })

  it('ne prend pas une frappe en composition pour un geste', () => {
    openWithMouse(surface)
    bindCloseKey(REBOUND)

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true, isComposing: true })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true, keyCode: 229 })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})

// Le tour complet n'a de sens que là où le menu compte plusieurs entrées : une
// entrée unique ramène forcément sur elle-même.
describe.each(surfaces.filter((surface) => ['liste des conversations', 'liste des groupes', 'menu du message'].includes(surface.label)))('$label : tour complet', (surface) => {
  it('descend et remonte en boucle', () => {
    openWithMouse(surface)
    const items = reachableItems()
    expect(items.length).toBeGreaterThan(1)

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])

    fireEvent.keyDown(window, { key: 'End' })
    expect(document.activeElement).toBe(items[items.length - 1])

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[items.length - 1])

    fireEvent.keyDown(window, { key: 'Home' })
    expect(document.activeElement).toBe(items[0])

    // Tab avance dans le menu au lieu d'en sortir.
    expect(fireEvent.keyDown(window, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(items[1])
  })
})
