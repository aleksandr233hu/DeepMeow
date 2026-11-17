import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveIdentitySource } from '../src/services/chat/identity.ts'
import type { Session } from '../src/services/chat/types.ts'

test('身份来源会话覆盖优先于全局', () => {
  assert.equal(resolveIdentitySource({ id: 's', identitySource: 'agent' } as Session, 'persona'), 'agent')
  assert.equal(resolveIdentitySource({ id: 's', identitySource: 'persona' } as Session, 'agent'), 'persona')
})

test('会话没有覆盖时跟随全局', () => {
  assert.equal(resolveIdentitySource({ id: 's' } as Session, 'agent'), 'agent')
  assert.equal(resolveIdentitySource(undefined, 'persona'), 'persona')
})
