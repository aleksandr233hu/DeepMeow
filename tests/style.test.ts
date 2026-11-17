import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveStyleProfile } from '../src/services/style/resolve.ts'
import {
  describeStyleProfile,
  migrateLegacyStylePreset,
  normalizeStyleProfile,
} from '../src/services/style/text.ts'
import { DEFAULT_STYLE_PROFILE } from '../src/services/style/types.ts'
import type { Session } from '../src/services/chat/types.ts'

test('旧的单选回答风格映射到新的基础风格', () => {
  assert.equal(migrateLegacyStylePreset('concise').base, 'efficient')
  assert.equal(migrateLegacyStylePreset('friendly').base, 'friendly')
  assert.equal(migrateLegacyStylePreset('formal').base, 'professional')
  assert.equal(migrateLegacyStylePreset('detailed').base, 'professional')
  assert.equal(migrateLegacyStylePreset('auto').base, 'default')
  assert.equal(migrateLegacyStylePreset(null).base, 'default')
})

test('非法风格对象回退到默认值', () => {
  assert.deepEqual(normalizeStyleProfile(null), DEFAULT_STYLE_PROFILE)
  assert.deepEqual(
    normalizeStyleProfile({ base: 'nope', friendliness: 'more', emoji: 3 }),
    { ...DEFAULT_STYLE_PROFILE, friendliness: 'more' }
  )
})

test('只输出非默认维度，顺序固定', () => {
  const lines = describeStyleProfile({
    base: 'sarcastic',
    friendliness: 'default',
    upbeat: 'more',
    emoji: 'less',
    visual: 'default',
    headings: 'more',
  })
  assert.equal(lines.length, 4)
  assert.match(lines[0] ?? '', /吐槽感/)
  assert.match(lines[1] ?? '', /更有活力/)
  assert.match(lines[2] ?? '', /少用或不用表情符号/)
  assert.match(lines[3] ?? '', /多用标题和列表/)
  assert.deepEqual(describeStyleProfile(DEFAULT_STYLE_PROFILE), [])
})

test('会话风格覆盖优先于全局', () => {
  const override = { ...DEFAULT_STYLE_PROFILE, base: 'blunt' as const }
  const session = { id: 's', styleProfile: override } as Session
  assert.equal(resolveStyleProfile(session, DEFAULT_STYLE_PROFILE), override)
  assert.equal(resolveStyleProfile({ id: 's' } as Session, DEFAULT_STYLE_PROFILE), DEFAULT_STYLE_PROFILE)
})
