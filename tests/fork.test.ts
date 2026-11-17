import assert from 'node:assert/strict'
import test from 'node:test'
import { createForkSession, getForkRounds } from '../src/services/chat/fork.ts'
import type { Message, Session } from '../src/services/chat/types.ts'

const user = (id: string, parentId: string | null, selectedChildId?: string): Message => ({
  id,
  role: 'user',
  content: `问题 ${id}`,
  files: [{ id: 'file-1', serverId: 'srv-1', name: 'a.png', size: 10, isImage: true, mimeType: 'image/png' }],
  createdAt: 1,
  parentId,
  ...(selectedChildId ? { selectedChildId } : {}),
})

const assistant = (id: string, parentId: string | null, selectedChildId?: string): Message => ({
  id,
  role: 'assistant',
  createdAt: 2,
  model: 'deepseek-flash',
  prefix: true,
  status: 'done',
  blocks: [{ type: 'text', text: `回答 ${id}` }],
  usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 },
  parentId,
  ...(selectedChildId ? { selectedChildId } : {}),
})

const buildSession = (rounds = 3): Session => {
  const messages: Message[] = []
  let parentId: string | null = null
  for (let index = 1; index <= rounds; index++) {
    const userId = `u${index}`
    const assistantId = `a${index}`
    messages.push(user(userId, parentId, assistantId))
    messages.push(assistant(assistantId, userId, index < rounds ? `u${index + 1}` : undefined))
    parentId = assistantId
  }
  return {
    id: 'original',
    title: '原会话',
    createdAt: 0,
    updatedAt: 0,
    rootMessageId: 'u1',
    messages,
    presetId: 'builtin-analyst',
    generation: { temperature: 0.3, systemPrompt: '本会话指令' },
    styleProfile: { base: 'blunt', friendliness: 'more', upbeat: 'less', emoji: 'default', visual: 'default', headings: 'more' },
    identitySource: 'agent',
    compression: { summary: '摘要', coveredIds: ['u1'], createdAt: 1 },
  }
}

test('取目标回复及其之前的完整对话组', () => {
  const session = buildSession(3)
  const two = getForkRounds(session, 'a2')
  assert.deepEqual(two?.map((round) => round.id), ['u1', 'u2'])
  const one = getForkRounds(session, 'a1')
  assert.deepEqual(one?.map((round) => round.id), ['u1'])
  assert.equal(getForkRounds(session, 'u1'), null)
  assert.equal(getForkRounds(session, 'missing'), null)
})

test('全选时复制全部对话组，并生成新的线性消息 ID', () => {
  const original = buildSession(2)
  const forked = createForkSession(original, 'a2', ['u1', 'u2'], '（分支）')
  assert.ok(forked)
  assert.equal(forked.messages.length, 4)
  assert.equal(forked.title, '原会话（分支）')
  assert.equal(forked.rootMessageId, forked.messages[0]?.id)
  assert.equal(forked.messages[0]?.parentId, null)
  assert.equal(forked.messages[0]?.selectedChildId, forked.messages[1]?.id)
  assert.equal(forked.messages[3]?.selectedChildId, undefined)
  assert.equal(forked.messages[3]?.parentId, forked.messages[2]?.id)
})

test('允许不连续勾选，按原顺序拼接', () => {
  const session = buildSession(3)
  const forked = createForkSession(session, 'a3', ['u1', 'u3'])
  assert.ok(forked)
  assert.equal(forked.messages.length, 4)
  const userContents = forked.messages
    .filter((message) => message.role === 'user')
    .map((message) => (message as { content: string }).content)
  assert.equal(userContents.length, 2)
  assert.match(userContents[0] ?? '', /问题 u1/)
  assert.match(userContents[1] ?? '', /问题 u3/)
})

test('目标轮次未勾选时，只把目标回答附在最后', () => {
  const session = buildSession(2)
  const forked = createForkSession(session, 'a2', ['u1'])
  assert.ok(forked)
  assert.equal(forked.messages.length, 3)
  assert.equal(forked.messages[2]?.role, 'assistant')
  assert.equal(forked.messages[2]?.id === 'a2', false)
})

test('继承设置、不复制压缩摘要，原会话不变', () => {
  const original = buildSession(2)
  const before = structuredClone(original)
  const forked = createForkSession(original, 'a1', ['u1'])
  assert.ok(forked)
  assert.equal(forked.presetId, original.presetId)
  assert.deepEqual(forked.generation, original.generation)
  assert.deepEqual(forked.styleProfile, original.styleProfile)
  assert.equal(forked.identitySource, original.identitySource)
  assert.equal(forked.compression, undefined)
  assert.deepEqual(original, before)
})
