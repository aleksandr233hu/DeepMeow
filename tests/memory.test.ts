import assert from 'node:assert/strict'
import test from 'node:test'

// 模块链路会读取构建期注入的 API 地址，Node 测试里先补上
;(globalThis as Record<string, unknown>).__API_ORIGIN__ = 'https://api.deepseek.com'

const { parseMemoryFacts } = await import('../src/services/memory/extract.ts')
const { normalizeMemoryText } = await import('../src/services/memory/text.ts')

test('记忆规范化折叠空白、去掉句末标点并忽略大小写', () => {
  assert.equal(normalizeMemoryText('  我 喜欢   TypeScript。 '), '我 喜欢 typescript')
  assert.equal(normalizeMemoryText('Prefer TS!'), 'prefer ts')
})

test('从纯 JSON 数组提取事实并限制为三条', () => {
  assert.deepEqual(parseMemoryFacts('["喜欢咖啡","住在杭州","用 TypeScript","第四个"]'), [
    '喜欢咖啡',
    '住在杭州',
    '用 TypeScript',
  ])
})

test('容忍代码块包裹与前后说明文字', () => {
  assert.deepEqual(parseMemoryFacts('好的：\n```json\n["喜欢咖啡"]\n```\n以上。'), ['喜欢咖啡'])
  assert.deepEqual(parseMemoryFacts('结果如下 [ "喜欢咖啡" ] 请查收'), ['喜欢咖啡'])
})

test('非法 JSON、非数组与空数组返回空结果', () => {
  assert.deepEqual(parseMemoryFacts('没有可记的内容'), [])
  assert.deepEqual(parseMemoryFacts('{"a":1}'), [])
  assert.deepEqual(parseMemoryFacts('[]'), [])
  assert.deepEqual(parseMemoryFacts('["ok", 3, null, ""]'), ['ok'])
})
