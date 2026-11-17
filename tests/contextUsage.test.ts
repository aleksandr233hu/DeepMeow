import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONTEXT_WINDOW,
  formatContextTokens,
  getContextUsage,
} from '../src/services/chat/contextUsage.ts'
import type { Message, Session } from '../src/services/chat/types.ts'

const user = (id: string, content: string, parentId: string | null): Message => ({
  id,
  role: 'user',
  content,
  files: [],
  createdAt: 0,
  parentId,
})

const assistant = (
  id: string,
  text: string,
  parentId: string | null,
  usage?: {
    input_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
    output_tokens: number
  }
): Message => ({
  id,
  role: 'assistant',
  createdAt: 10,
  model: 'deepseek-flash',
  prefix: true,
  status: 'done',
  blocks: [{ type: 'text', text }],
  parentId,
  usage,
})

const buildSession = (messages: Message[], extra: Partial<Session> = {}): Session => ({
  id: 's',
  title: '',
  createdAt: 0,
  updatedAt: 0,
  messages: messages.map((message, index) => ({
    ...message,
    selectedChildId: messages[index + 1]?.id,
  })),
  rootMessageId: messages[0]?.id ?? null,
  ...extra,
})

test('优先使用服务端 usage，合计输入、缓存与输出', () => {
  const session = buildSession([
    user('u1', '你好', null),
    assistant('a1', '回答', 'u1', {
      input_tokens: 100,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 30,
      output_tokens: 50,
    }),
  ])
  const usage = getContextUsage(session)
  assert.equal(usage.used, 200)
  assert.equal(usage.measured, true)
  assert.equal(usage.estimated, false)
  assert.equal(usage.remaining, CONTEXT_WINDOW - 200)
})

test('最近回复之后新增的消息按字符估算追加', () => {
  const session = buildSession([
    user('u1', '你好', null),
    assistant('a1', '回答', 'u1', {
      input_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 50,
    }),
    user('u2', '新'.repeat(100), 'a1'),
  ])
  const usage = getContextUsage(session)
  assert.equal(usage.used, 200)
  assert.equal(usage.estimated, true)
  assert.equal(usage.measured, true)
})

test('压缩晚于最近回复时按保留消息与摘要估算', () => {
  const session = buildSession(
    [
      user('u1', '旧'.repeat(1000), null),
      assistant('a1', '旧回答'.repeat(500), 'u1', {
        input_tokens: 5000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 1000,
      }),
      user('u2', '新'.repeat(100), 'a1'),
      assistant('a2', '新回答'.repeat(100), 'u2', {
        input_tokens: 300,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 50,
      }),
    ],
    {
      compression: {
        summary: '摘'.repeat(50),
        coveredIds: ['u1', 'a1'],
        createdAt: 50,
      },
    }
  )
  // 压缩时间晚于 a2.createdAt(=10)，因此走估算：保留 u2 与 a2，加摘要
  const usage = getContextUsage(session)
  assert.equal(usage.estimated, true)
  assert.equal(usage.measured, false)
  assert.equal(usage.used, Math.ceil((100 + 300 + 50) / 2))
})

test('从未请求过时按全部消息估算', () => {
  const session = buildSession([user('u1', '你好'.repeat(50), null)])
  const usage = getContextUsage(session)
  assert.equal(usage.estimated, true)
  assert.equal(usage.measured, false)
  assert.equal(usage.used, Math.ceil(100 / 2))
})

test('用量格式化', () => {
  assert.equal(formatContextTokens(0), '0')
  assert.equal(formatContextTokens(999), '999')
  assert.equal(formatContextTokens(354_000), '354k')
  assert.equal(formatContextTokens(1_000_000), '1.0M')
})
