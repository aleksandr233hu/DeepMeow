/** 头像角色：用户与助手各一份 */
export type AvatarRole = 'user' | 'assistant'

export type AvatarRecord = {
  id: AvatarRole
  blob: Blob
  mimeType: string
  updatedAt: number
}

export const AVATAR_ROLES: readonly AvatarRole[] = ['user', 'assistant']
