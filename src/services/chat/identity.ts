import type { Session } from './types.js'

/** 身份来源：人格预设或 Agent 自定义指令，二者只发送一个 */
export type IdentitySource = 'persona' | 'agent'

/** 会话覆盖优先；没有覆盖时使用全局默认 */
export const resolveIdentitySource = (
  session: Session | undefined,
  global: IdentitySource
): IdentitySource => session?.identitySource ?? global
