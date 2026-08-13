import { describe, it, expect, beforeEach } from 'vitest'
import { useContactStore } from '@/stores/contactStore'
import { useMessageStore } from '@/stores/messageStore'
import { useGroupStore } from '@/stores/groupStore'
import { useCallStore } from '@/stores/callStore'
import type { Contact, Message, GroupMember } from '@/types'

describe('ContactStore', () => {
  beforeEach(() => {
    useContactStore.setState({ contacts: {}, searchQuery: '' })
  })

  const mockContact: Contact = {
    publicKey: 'abc123def456' + 'x'.repeat(52),
    displayName: 'Alice',
    status: 'online',
    relation: 'contact',
    verified: false,
    addedAt: Date.now(),
  }

  it('adds a contact', () => {
    useContactStore.getState().addContact(mockContact)
    expect(useContactStore.getState().contacts[mockContact.publicKey]).toBeDefined()
  })

  it('updates a contact', () => {
    useContactStore.getState().addContact(mockContact)
    useContactStore.getState().updateContact(mockContact.publicKey, { displayName: 'Alice Updated' })
    expect(useContactStore.getState().contacts[mockContact.publicKey].displayName).toBe('Alice Updated')
  })

  it('removes a contact', () => {
    useContactStore.getState().addContact(mockContact)
    useContactStore.getState().removeContact(mockContact.publicKey)
    expect(useContactStore.getState().contacts[mockContact.publicKey]).toBeUndefined()
  })

  it('blocks a contact', () => {
    useContactStore.getState().addContact(mockContact)
    useContactStore.getState().blockContact(mockContact.publicKey)
    expect(useContactStore.getState().contacts[mockContact.publicKey].relation).toBe('blocked')
  })

  it('filters blocked contacts from getFilteredContacts', () => {
    useContactStore.getState().addContact(mockContact)
    useContactStore.getState().blockContact(mockContact.publicKey)
    const filtered = useContactStore.getState().getFilteredContacts()
    expect(filtered.find((c) => c.publicKey === mockContact.publicKey)).toBeUndefined()
  })
})

describe('MessageStore', () => {
  const convId = 'conv-001'

  beforeEach(() => {
    useMessageStore.setState({ messages: {}, loading: {}, hasMore: {}, pending: {} })
  })

  const mockMessage: Message = {
    id: 'msg-001',
    conversationId: convId,
    senderId: 'sender-pk',
    type: 'text',
    content: 'Hello, Asgard!',
    timestamp: Date.now(),
    status: 'sent',
  }

  it('adds a message', () => {
    useMessageStore.getState().addMessage(mockMessage)
    expect(useMessageStore.getState().getMessages(convId)).toHaveLength(1)
  })

  it('prevents duplicate messages', () => {
    useMessageStore.getState().addMessage(mockMessage)
    useMessageStore.getState().addMessage(mockMessage)
    expect(useMessageStore.getState().getMessages(convId)).toHaveLength(1)
  })

  it('edits a message', () => {
    useMessageStore.getState().addMessage(mockMessage)
    useMessageStore.getState().editMessage(mockMessage.id, convId, 'Edited content')
    const messages = useMessageStore.getState().getMessages(convId)
    expect(messages[0].content).toBe('Edited content')
    expect(messages[0].edits).toHaveLength(1)
    expect(messages[0].edits![0].previousContent).toBe('Hello, Asgard!')
  })

  it('deletes a message', () => {
    useMessageStore.getState().addMessage(mockMessage)
    useMessageStore.getState().deleteMessage(mockMessage.id, convId)
    const messages = useMessageStore.getState().getMessages(convId)
    expect(messages[0].deleted).toBe(true)
    expect(messages[0].content).toBe('')
  })

  it('adds a reaction', () => {
    useMessageStore.getState().addMessage(mockMessage)
    useMessageStore.getState().addReaction(mockMessage.id, convId, '👍', 'user-1')
    const messages = useMessageStore.getState().getMessages(convId)
    expect(messages[0].reactions).toHaveLength(1)
    expect(messages[0].reactions![0].emoji).toBe('👍')
    expect(messages[0].reactions![0].count).toBe(1)
  })

  it('removes a reaction', () => {
    useMessageStore.getState().addMessage(mockMessage)
    useMessageStore.getState().addReaction(mockMessage.id, convId, '👍', 'user-1')
    useMessageStore.getState().removeReaction(mockMessage.id, convId, '👍', 'user-1')
    const messages = useMessageStore.getState().getMessages(convId)
    expect(messages[0].reactions).toHaveLength(0)
  })
})

// ─── GroupStore Tests ──────────────────────────────────────────────────────

describe('GroupStore', () => {
  beforeEach(() => {
    useGroupStore.setState({
      groups: {},
      activeGroupId: null,
      activeChannelId: null,
      searchQuery: '',
    })
  })

  it('creates a group', () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Test Group',
      description: 'A test group',
      ownerId: 'owner-pk',
      ownerDisplayName: 'Owner',
    })
    expect(group).toBeDefined()
    expect(group.name).toBe('Test Group')
    expect(group.members).toHaveLength(1)
    expect(group.channels.length).toBeGreaterThanOrEqual(1)
  })

  it('joins a group', () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Join Test',
      ownerId: 'owner-pk',
      ownerDisplayName: 'Owner',
    })
    useGroupStore.setState({ groups: {} })
    useGroupStore.getState().joinGroup(group)
    expect(useGroupStore.getState().groups[group.id]).toBeDefined()
  })

  it('leaves a group', () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Leave Test',
      ownerId: 'owner-pk',
      ownerDisplayName: 'Owner',
    })
    useGroupStore.getState().leaveGroup(group.id)
    expect(useGroupStore.getState().groups[group.id]).toBeUndefined()
  })

  it('adds and removes a member', () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Member Test',
      ownerId: 'owner-pk',
      ownerDisplayName: 'Owner',
    })
    const member: GroupMember = {
      publicKey: 'new-member-pk',
      displayName: 'New Member',
      role: 'member',
      joinedAt: Date.now(),
      canPost: true,
    }
    useGroupStore.getState().addMember(group.id, member)
    expect(useGroupStore.getState().getMembers(group.id)).toHaveLength(2)

    useGroupStore.getState().removeMember(group.id, 'new-member-pk')
    expect(useGroupStore.getState().getMembers(group.id)).toHaveLength(1)
  })

  it('sets active group', () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Active Test',
      ownerId: 'owner-pk',
      ownerDisplayName: 'Owner',
    })
    useGroupStore.getState().setActiveGroup(group.id)
    expect(useGroupStore.getState().activeGroupId).toBe(group.id)
    expect(useGroupStore.getState().getActiveGroup()?.name).toBe('Active Test')
  })

  it('adds a channel', () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Channel Test',
      ownerId: 'owner-pk',
      ownerDisplayName: 'Owner',
    })
    const channel = useGroupStore.getState().addChannel(group.id, {
      name: 'general',
      type: 'text',
    })
    expect(channel).not.toBeNull()
    expect(channel!.name).toBe('general')
    expect(useGroupStore.getState().getChannels(group.id).length).toBeGreaterThanOrEqual(2)
  })

  it('checks admin status', () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Admin Test',
      ownerId: 'owner-pk',
      ownerDisplayName: 'Owner',
    })
    expect(useGroupStore.getState().isAdmin(group.id, 'owner-pk')).toBe(true)
    expect(useGroupStore.getState().isAdmin(group.id, 'random-pk')).toBe(false)
  })
})

// ─── CallStore Tests ───────────────────────────────────────────────────────

describe('CallStore', () => {
  beforeEach(() => {
    useCallStore.setState({
      activeCall: null,
      incomingCall: null,
      history: [],
      isMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
    })
  })

  it('starts a call', () => {
    useCallStore.getState().startCall('peer-1', 'Alice', 'audio')
    const call = useCallStore.getState().activeCall
    expect(call).not.toBeNull()
    expect(call!.peerId).toBe('peer-1')
    expect(call!.peerName).toBe('Alice')
    expect(call!.status).toBe('outgoing')
    expect(call!.type).toBe('audio')
  })

  it('receives and accepts a call', () => {
    const incoming = {
      id: 'call-in-1',
      peerId: 'peer-2',
      peerName: 'Bob',
      type: 'video' as const,
      status: 'incoming' as const,
      direction: 'incoming' as const,
      startedAt: Date.now(),
      missed: false,
    }
    useCallStore.getState().receiveCall(incoming)
    expect(useCallStore.getState().incomingCall?.peerName).toBe('Bob')

    useCallStore.getState().acceptCall()
    expect(useCallStore.getState().activeCall?.status).toBe('connected')
    expect(useCallStore.getState().incomingCall).toBeNull()
  })

  it('rejects a call and adds to history as missed', () => {
    const incoming = {
      id: 'call-in-2',
      peerId: 'peer-3',
      peerName: 'Charlie',
      type: 'audio' as const,
      status: 'incoming' as const,
      direction: 'incoming' as const,
      startedAt: Date.now(),
      missed: false,
    }
    useCallStore.getState().receiveCall(incoming)
    useCallStore.getState().rejectCall()

    expect(useCallStore.getState().incomingCall).toBeNull()
    expect(useCallStore.getState().history).toHaveLength(1)
    expect(useCallStore.getState().history[0].missed).toBe(true)
  })

  it('ends a call and records duration', () => {
    useCallStore.getState().startCall('peer-4', 'Diana', 'video')
    useCallStore.getState().endCall()

    expect(useCallStore.getState().activeCall).toBeNull()
    expect(useCallStore.getState().history).toHaveLength(1)
    expect(useCallStore.getState().history[0].status).toBe('ended')
    expect(useCallStore.getState().history[0].duration).toBeDefined()
  })

  it('toggles media controls', () => {
    expect(useCallStore.getState().isMuted).toBe(false)
    useCallStore.getState().toggleMute()
    expect(useCallStore.getState().isMuted).toBe(true)

    expect(useCallStore.getState().isCameraOff).toBe(false)
    useCallStore.getState().toggleCamera()
    expect(useCallStore.getState().isCameraOff).toBe(true)

    expect(useCallStore.getState().isScreenSharing).toBe(false)
    useCallStore.getState().toggleScreenShare()
    expect(useCallStore.getState().isScreenSharing).toBe(true)
  })

  it('clears history', () => {
    useCallStore.getState().startCall('peer-5', 'Eve', 'audio')
    useCallStore.getState().endCall()
    expect(useCallStore.getState().history).toHaveLength(1)

    useCallStore.getState().clearHistory()
    expect(useCallStore.getState().history).toHaveLength(0)
  })
})
