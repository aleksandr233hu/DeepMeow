import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getVisibleMessages,
  removeMessage,
} from '../src/services/chat/branches.ts'
import type { Message, Session } from '../src/services/chat/types.ts'

const user = (id: string, parentId: string | null, selectedChildId?: string): Message => ({
  id,
  role: 'user',
  content: id,
  files: [],
  createdAt: 0,
  parentId,
  ...(selectedChildId ? { selectedChildId } : {}),
})

const assistant = (
  id: string,
  parentId: string | null,
  selectedChildId?: string
): Message => ({
  id,
  role: 'assistant',
  createdAt: 0,
  model: 'deepseek-flash',
  prefix: true,
  status: 'done',
  blocks: [{ type: 'text', text: id }],
  parentId,
  ...(selectedChildId ? { selectedChildId } : {}),
})

const visibleIds = (session: Session) => getVisibleMessages(session).map((message) => message.id)

test('删除中间消息后，子节点接回父节点且上下文保持连贯', () => {
  const session: Session = {
    id: 's',
    title: '',
    createdAt: 0,
    updatedAt: 0,
    rootMessageId: 'u1',
    messages: [
      user('u1', null, 'a1'),
      assistant('a1', 'u1', 'u2'),
      user('u2', 'a1', 'a2'),
      assistant('a2', 'u2'),
    ],
  }
  assert.deepEqual(visibleIds(removeMessage(session, 'u2')), ['u1', 'a1', 'a2'])
  assert.deepEqual(visibleIds(removeMessage(session, 'a1')), ['u1', 'u2', 'a2'])
})

test('删除根消息后由选中的子节点接替', () => {
  const session: Session = {
    id: 's',
    title: '',
    createdAt: 0,
    updatedAt: 0,
    rootMessageId: 'u1',
    messages: [user('u1', null, 'a1'), assistant('a1', 'u1')],
  }
  const next = removeMessage(session, 'u1')
  assert.equal(next.rootMessageId, 'a1')
  assert.equal(next.messages[0]?.parentId, null)
  assert.deepEqual(visibleIds(next), ['a1'])
})

test('删除当前版本后自动切到同父的另一个版本', () => {
  const session: Session = {
    id: 's',
    title: '',
    createdAt: 0,
    updatedAt: 0,
    rootMessageId: 'u1',
    messages: [
      user('u1', null, 'a1'),
      assistant('a1', 'u1'),
      assistant('a2', 'u1'),
    ],
  }
  const next = removeMessage(session, 'a1')
  assert.deepEqual(visibleIds(next), ['u1', 'a2'])
  assert.equal(next.messages.find((message) => message.id === 'u1')?.selectedChildId, 'a2')
})

test('删除末尾消息后停在父节点，且不影响其它分支', () => {
  const session: Session = {
    id: 's',
    title: '',
    createdAt: 0,
    updatedAt: 0,
    rootMessageId: 'u1',
    messages: [
      user('u1', null, 'a1'),
      assistant('a1', 'u1', 'u2'),
      user('u2', 'a1', 'a2'),
      assistant('a2', 'u2'),
    ],
  }
  const next = removeMessage(session, 'a2')
  assert.deepEqual(visibleIds(next), ['u1', 'a1', 'u2'])
  assert.equal(next.messages.find((message) => message.id === 'u2')?.selectedChildId, undefined)
})

test('删空会话后 rootMessageId 为空，未知消息保持原对象', () => {
  const session: Session = {
    id: 's',
    title: '',
    createdAt: 0,
    updatedAt: 0,
    rootMessageId: 'u1',
    messages: [user('u1', null)],
  }
  assert.equal(removeMessage(session, 'u1').rootMessageId, null)
  assert.equal(removeMessage(session, 'missing'), session)
})
