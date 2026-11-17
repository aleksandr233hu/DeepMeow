/**
 * Node 测试加载器：源码使用 NodeNext 的 `.js` 说明符，实际文件是 `.ts`。
 * 解析失败时退回同名 `.ts`，让 `node --test` 能直接跑 TS 源码。
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && specifier.endsWith('.js')) {
    try {
      return await nextResolve(specifier, context)
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND') {
        return nextResolve(`${specifier.slice(0, -3)}.ts`, context)
      }
      throw error
    }
  }
  return nextResolve(specifier, context)
}
