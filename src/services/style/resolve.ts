import type { Session } from '../chat/types.js'
import type { StyleProfile } from './types.js'

/** 会话覆盖优先；没有覆盖时使用全局默认 */
export const resolveStyleProfile = (
  session: Session | undefined,
  global: StyleProfile
): StyleProfile => session?.styleProfile ?? global
