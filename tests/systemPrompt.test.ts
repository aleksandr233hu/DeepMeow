import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSystemPrompt } from '../src/services/chat/systemPrompt.ts'
import type { Preset } from '../src/services/presets/types.ts'

const preset: Preset = {
  id: 'p',
  name: '导师',
  emoji: '🎓',
  systemPrompt: '你是严格的论文导师。',
  builtin: false,
  createdAt: 0,
  updatedAt: 0,
}

test('没有任何个性化内容时只保留基础身份', () => {
  assert.equal(buildSystemPrompt({}), '该助手为DeepSeek，由深度求索公司创造。')
})

test('按 Agent 指令、人格、用户资料、自定义指令、风格、记忆、摘要的顺序组装', () => {
  const prompt = buildSystemPrompt({
    agentInstructions: 'You are a helpful assistant.',
    preset,
    nickname: '小林',
    occupation: '产品经理',
    aboutMe: '我在做笔记应用',
    responseStyle: '先给结论',
    styleProfile: {
      base: 'professional',
      friendliness: 'more',
      upbeat: 'default',
      emoji: 'less',
      visual: 'default',
      headings: 'more',
    },
    memories: ['我习惯用 TypeScript'],
    compression: { summary: '此前讨论了需求范围', coveredIds: [], createdAt: 0 },
  })
  const order = [
    '# Agent 自定义指令',
    '# 当前人格',
    '# 关于用户',
    '# 自定义指令',
    '# 回答风格',
    '# 长期记忆',
    '# 更早对话的摘要',
  ].map((title) => prompt.indexOf(title))
  assert.ok(order.every((index) => index >= 0))
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  assert.match(prompt, /You are a helpful assistant\./)
  assert.match(prompt, /称呼：小林/)
  assert.match(prompt, /身份：产品经理/)
  assert.match(prompt, /先给结论/)
  assert.match(prompt, /关于你：我在做笔记应用/)
  assert.match(prompt, /整体语气：专业、可靠、精确/)
  assert.match(prompt, /语气更亲切、更有人情味/)
  assert.match(prompt, /尽量少用或不用表情符号/)
  assert.match(prompt, /多用标题和列表组织内容/)
  assert.match(prompt, /- 我习惯用 TypeScript/)
})

test('风格全部为默认时不注入回答风格段', () => {
  const prompt = buildSystemPrompt({})
  assert.doesNotMatch(prompt, /回答风格/)
  assert.doesNotMatch(prompt, /整体语气/)
})

test('记忆注入受条数与字数双重上限约束', () => {
  const manyShort = Array.from({ length: 60 }, (_, index) => `记忆${index}`)
  const shortPrompt = buildSystemPrompt({ memories: manyShort })
  const shortLines = shortPrompt.split('\n').filter((line) => line.startsWith('- '))
  assert.equal(shortLines.length, 40)

  const manyLong = Array.from({ length: 60 }, (_, index) => `${index}`.padEnd(100, '记'))
  const longPrompt = buildSystemPrompt({ memories: manyLong })
  const longLines = longPrompt.split('\n').filter((line) => line.startsWith('- '))
  assert.ok(longLines.length < 40)
  const memorySection = longPrompt.slice(longPrompt.indexOf('# 长期记忆'))
  assert.ok(memorySection.length < 1700)
})

test('空记忆与空白字段被忽略', () => {
  const prompt = buildSystemPrompt({
    nickname: '   ',
    memories: ['', '   ', '有效记忆'],
  })
  assert.doesNotMatch(prompt, /关于用户/)
  assert.match(prompt, /- 有效记忆/)
  assert.doesNotMatch(prompt, /- {2,}/)
})
