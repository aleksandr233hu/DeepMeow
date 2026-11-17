import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampTemperature,
  clampTopP,
  resolveGeneration,
} from '../src/services/chat/generation.ts'
import type { Session } from '../src/services/chat/types.ts'

const session = (generation?: Session['generation']): Session => ({
  id: 's',
  title: '',
  createdAt: 0,
  updatedAt: 0,
  messages: [],
  rootMessageId: null,
  generation,
})

const defaults = { temperature: null, topP: null, agentInstructions: '默认提示词' }

test('没有覆盖时使用全局默认；全局 null 表示模型默认', () => {
  assert.deepEqual(resolveGeneration(session(), defaults), {
    temperature: null,
    topP: null,
    agentInstructions: '默认提示词',
  })
})

test('会话覆盖优先于全局', () => {
  const effective = resolveGeneration(
    session({ temperature: 0.3, topP: 0.8, systemPrompt: '本会话提示词' }),
    { temperature: 1.2, topP: 0.5, agentInstructions: '默认提示词' }
  )
  assert.deepEqual(effective, {
    temperature: 0.3,
    topP: 0.8,
    agentInstructions: '本会话提示词',
  })
})

test('会话把系统提示词显式设为空字符串时不再回退到全局', () => {
  const effective = resolveGeneration(session({ systemPrompt: '' }), defaults)
  assert.equal(effective.agentInstructions, '')
})

test('会话只覆盖一个参数时，另一个继续跟随全局', () => {
  const effective = resolveGeneration(session({ temperature: 0.2 }), {
    temperature: 1,
    topP: 0.9,
    agentInstructions: '',
  })
  assert.equal(effective.temperature, 0.2)
  assert.equal(effective.topP, 0.9)
})

test('参数越界时被夹到合法范围', () => {
  assert.equal(clampTemperature(3), 2)
  assert.equal(clampTemperature(-1), 0)
  assert.equal(clampTemperature(null), null)
  assert.equal(clampTopP(0), 0.01)
  assert.equal(clampTopP(1.5), 1)
  assert.equal(clampTopP(null), null)
})
