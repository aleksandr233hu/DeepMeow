import assert from 'node:assert/strict'
import test from 'node:test'

// 模块顶层会读取构建期注入的 API 地址，Node 测试里先补上
;(globalThis as Record<string, unknown>).__API_ORIGIN__ = 'https://api.deepseek.com'

const { CompressionError, excludeCovered, planCompression } = await import(
  '../src/services/chat/compress.ts'
)
const { getVisibleMessages } = await import('../src/services/chat/branches.ts')
import type { Message, Session } from '../src/services/chat/types.ts'

const buildSession = (rounds: number): Session => {
  const messages: Message[] = []
  let parentId: string | null = null
  for (let index = 0; index < rounds; index++) {
    const userId = `u${index + 1}`
    const replyId = `a${index + 1}`
    const user: Message = {
      id: userId,
      role: 'user',
      content: `问题 ${index + 1}`,
      files: [],
      createdAt: index * 2,
      parentId,
      selectedChildId: replyId,
    }
    const reply: Message = {
      id: replyId,
      role: 'assistant',
      createdAt: index * 2 + 1,
      model: 'deepseek-flash',
      prefix: true,
      status: 'done',
      blocks: [{ type: 'text', text: `回答 ${index + 1}` }],
      parentId: userId,
      ...(index < rounds - 1 ? { selectedChildId: `u${index + 2}` } : {}),
    }
    messages.push(user, reply)
    parentId = replyId
  }
  return {
    id: 's',
    title: '',
    createdAt: 0,
    updatedAt: 0,
    rootMessageId: 'u1',
    messages,
  }
}

test('压缩规划保留最近三轮，只覆盖更早的完整轮次', () => {
  const session = buildSession(5)
  const { coveredIds, transcript } = planCompression(session)
  assert.deepEqual(coveredIds, ['u1', 'a1', 'u2', 'a2'])
  assert.match(transcript, /问题 1/)
  assert.match(transcript, /回答 2/)
  assert.doesNotMatch(transcript, /问题 3/)
  assert.equal(coveredIds.length + 6, getVisibleMessages(session).length)
})

test('不足四轮时拒绝压缩', () => {
  assert.throws(
    () => planCompression(buildSession(3)),
    (error: unknown) => error instanceof CompressionError && error.reason === 'tooShort'
  )
})

test('被压缩的消息不再进入请求历史，其余顺序不变', () => {
  const session = buildSession(5)
  const compression = {
    summary: '摘要',
    coveredIds: ['u1', 'a1'],
    createdAt: 0,
  }
  const remaining = excludeCovered(compression, getVisibleMessages(session))
  assert.equal(remaining.length, 8)
  assert.equal(remaining[0]?.id, 'u2')
})
