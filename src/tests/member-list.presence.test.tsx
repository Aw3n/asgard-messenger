/**
 * La liste des membres doit dire la présence et la sourdine.
 *
 * La pastille de statut et l'icône de sourdine étaient purement visuelles :
 * le lecteur d'écran n'annonçait que le nom et le rôle, sans dire qui est
 * absent, occupé, hors ligne, ni qui a été mis en sourdine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemberList } from '@/features/groups/components/MemberList'
import { useGroupStore } from '@/stores/groupStore'
import type { Group, GroupMember } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/ui/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}))

const GROUP_ID = 'groupe-abcdef123456'
const OWNER = 'a'.repeat(64)
const BOB = 'b'.repeat(64)
const CAROL = 'c'.repeat(64)
const DAN = 'd'.repeat(64)

const buildMember = (over: Partial<GroupMember>): GroupMember => ({
  publicKey: '',
  displayName: '',
  role: 'member',
  joinedAt: 1,
  canPost: true,
  ...over,
})

const now = Date.now()
const members: GroupMember[] = [
  buildMember({ publicKey: OWNER, displayName: 'Alice', role: 'owner', status: 'online', lastSeen: now }),
  buildMember({ publicKey: BOB, displayName: 'Bob', status: 'away', lastSeen: now }),
  buildMember({ publicKey: CAROL, displayName: 'Carol', status: 'busy', mutedBy: OWNER, lastSeen: now }),
  buildMember({ publicKey: DAN, displayName: 'Dan', role: 'guest', status: 'offline', lastSeen: now }),
]

const group: Group = {
  id: GROUP_ID,
  name: 'Équipe',
  members,
  channels: [],
  createdAt: 1,
  ownerId: OWNER,
  isPublic: false,
  maxMembers: 100,
}

/** La ligne d'un membre : son texte contient le nom et les états annoncés. */
const rowFor = (name: string): HTMLElement => {
  const row = screen.getAllByRole('listitem').find((item) => item.textContent?.includes(name))
  if (!row) throw new Error(`membre ${name} introuvable`)
  return row
}

describe('liste des membres annoncée', () => {
  beforeEach(() => {
    useGroupStore.setState({
      groups: { [GROUP_ID]: group },
      activeGroupId: GROUP_ID,
      // Dan est absent de la présence : la ligne doit pourtant dire « hors ligne ».
      groupPresence: {
        [GROUP_ID]: { [OWNER]: 'online', [BOB]: 'away', [CAROL]: 'busy' },
      },
    })
  })

  afterEach(cleanup)

  it('nomme la présence de chaque membre, y compris hors ligne', () => {
    render(<MemberList />)

    expect(rowFor('Alice')).toHaveTextContent(/common\.online/)
    expect(rowFor('Bob')).toHaveTextContent(/common\.away/)
    expect(rowFor('Carol')).toHaveTextContent(/common\.busy/)
    expect(rowFor('Dan')).toHaveTextContent(/common\.offline/)
  })

  it('dit la sourdine, et seulement pour le membre concerné', () => {
    render(<MemberList />)

    expect(rowFor('Carol')).toHaveTextContent(/chat\.mutedConversation/)
    expect(rowFor('Bob')).not.toHaveTextContent(/chat\.mutedConversation/)
  })
})
