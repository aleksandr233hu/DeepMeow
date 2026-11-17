import { BackupError, fail } from './errors.js'
import {
  EXPORT_FORMAT_VERSION,
  type ChatMessage,
  type FileEntry,
  type Fragment,
  type SearchResult,
  type SessionFile,
  type SessionIndexEntry,
} from './format.js'

/**
 * 按格式定义校验：容器与元数据严格校验，无法解析的内容片段丢弃。
 * 校验通过后就地返回原对象，只为需要修正的字段做浅拷贝——导入几百 MB 的归档时，
 * 逐字段重建对象（每条消息、每个片段都新建）是解析阶段的主要开销。
 * 可空字段必须显式为 null；可选字段允许缺省，存在时严格校验。
 */

type Read<T> = (value: unknown) => T

const invalid = () => fail('backupIncomplete')

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid()

const string: Read<string> = (value) => (typeof value === 'string' ? value : invalid())

const boolean: Read<boolean> = (value) => (typeof value === 'boolean' ? value : invalid())

const number: Read<number> = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : invalid()

/** 非负安全整数（u32 等） */
const count: Read<number> = (value) =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : invalid()

const time: Read<string> = (value) => {
  if (typeof value !== 'string') {
    return invalid()
  }
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(value)
  if (!match) {
    return invalid()
  }
  // Date 只保留毫秒；校验时补齐/截断精度，返回时保留原文，避免丢失微秒或纳秒。
  const milliseconds = `${match[1]}.${(match[2] ?? '').padEnd(3, '0').slice(0, 3)}Z`
  const parsed = new Date(milliseconds)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === milliseconds
    ? value
    : invalid()
}

const nullable =
  <T>(read: Read<T>): Read<T | null> =>
  (value) =>
    value === null ? null : read(value)

const list =
  <T>(read: Read<T>): Read<T[]> =>
  (value) =>
    Array.isArray(value) ? value.map(read) : invalid()

const oneOf =
  <const T extends string>(...values: T[]): Read<T> =>
  (value) =>
    values.includes(value as T) ? (value as T) : invalid()

const tipStyle = oneOf('INFO', 'WARNING', 'CAUTION')
const searchStatus = oneOf('WIP', 'FINISHED', 'FAILED')
/** 校验工具元数据；就地校验只断言类型，不重建对象 */
const checkToolMetadata = (item: Record<string, unknown>) => {
  if ('stage_id' in item) {
    count(item.stage_id)
  }
  if ('group_id' in item) {
    count(item.group_id)
  }
}

const searchResult: Read<SearchResult> = (value) => {
  const item = record(value)
  string(item.url)
  string(item.title)
  string(item.snippet)
  nullable(time)(item.published_at)
  nullable(string)(item.site_name)
  if ('site_icon' in item) {
    nullable(string)(item.site_icon)
  }
  return item as unknown as SearchResult
}

const fileEntry: Read<FileEntry> = (value) => {
  const item = record(value)
  string(item.id)
  string(item.file_name)
  count(item.file_size)
  nullable(count)(item.token_usage)
  time(item.inserted_at)
  nullable(string)(item.export_path)
  boolean(item.is_image)
  nullable(count)(item.width)
  nullable(count)(item.height)
  return item as unknown as FileEntry
}

const readFragment: Read<Fragment> = (value) => {
  const item = record(value)
  const type = string(item.type)
  switch (type) {
    case 'REQUEST':
    case 'RESPONSE':
    case 'TEMPLATE_RESPONSE':
      string(item.content)
      return item as unknown as Fragment
    case 'THINK':
      string(item.content)
      nullable(number)(item.elapsed_secs)
      return item as unknown as Fragment
    case 'TIP':
    case 'CONTENT_RISK':
      string(item.content)
      tipStyle(item.style)
      return item as unknown as Fragment
    case 'PARTIAL_FILE_READ': {
      const ratio = number(item.ratio)
      if (ratio < 0 || ratio > 100) {
        invalid()
      }
      return item as unknown as Fragment
    }
    case 'TOOL_SEARCH':
      list(string)(item.queries)
      list(searchResult)(item.results)
      if ('status' in item) {
        searchStatus(item.status)
      }
      checkToolMetadata(item)
      return item as unknown as Fragment
    case 'TOOL_OPEN':
      searchStatus(item.status)
      nullable(string)(item.url)
      nullable(string)(item.title)
      if ('snippet' in item) {
        nullable(string)(item.snippet)
      }
      if ('site_name' in item) {
        nullable(string)(item.site_name)
      }
      nullable(time)(item.published_at)
      checkToolMetadata(item)
      return item as unknown as Fragment
    case 'TOOL_FIND':
      oneOf('WIP', 'FINISHED', 'NO_RESULT', 'FAILED')(item.status)
      if ('pattern' in item) {
        string(item.pattern)
      }
      checkToolMetadata(item)
      return item as unknown as Fragment
    case 'READ_LINK':
      list((result) => {
        const entry = record(result)
        string(entry.signature)
        if ('url' in entry) {
          string(entry.url)
        }
        if ('title' in entry) {
          nullable(string)(entry.title)
        }
        return entry
      })(item.results)
      return item as unknown as Fragment
    case 'FILE':
      list(fileEntry)(item.files)
      return item as unknown as Fragment
    case 'TOOL_IMAGE_SEARCH':
      searchStatus(item.status)
      if ('image_indexes' in item) {
        list(count)(item.image_indexes)
      }
      checkToolMetadata(item)
      list((result) => {
        const entry = record(result)
        string(entry.title)
        string(entry.source_page_url)
        string(entry.snippet)
        nullable(string)(entry.site_name)
        nullable(time)(entry.published_at)
        return entry
      })(item.results)
      return item as unknown as Fragment
    default:
      return invalid()
  }
}

/** 单个内容片段不兼容不影响其余消息；容器、元数据和后续消息树校验仍严格执行。 */
const fragment: Read<Fragment | null> = (value) => {
  try {
    return readFragment(value)
  } catch (error) {
    if (error instanceof BackupError && error.key === 'backupIncomplete') {
      return null
    }
    throw error
  }
}

const message: Read<ChatMessage> = (value) => {
  const item = record(value)
  count(item.id)
  nullable(count)(item.parent_id)
  oneOf('USER', 'ASSISTANT')(item.role)
  oneOf(
    'WIP',
    'FINISHED',
    'CONTENT_FILTER',
    'FAILED',
    'INCOMPLETE',
    'CONTEXT_LENGTH_EXCEEDED',
    'TIMEOUT'
  )(item.status)
  boolean(item.thinking_enabled)
  boolean(item.search_enabled)
  count(item.accumulated_token_usage)
  time(item.inserted_at)
  const rawFragments = item.fragments
  if (!Array.isArray(rawFragments)) {
    return invalid()
  }
  // 逐个校验片段、丢掉不兼容的，但不再重建片段对象本身
  const fragments: Fragment[] = []
  for (const raw of rawFragments) {
    const checked = fragment(raw)
    if (checked) {
      fragments.push(checked)
    }
  }
  return { ...item, fragments } as unknown as ChatMessage
}

/** 会话 ID 用于拼接条目名，不能含路径分隔符 */
const sessionId: Read<string> = (value) => {
  const id = string(value)
  return id && !/[/\\]/.test(id) && id !== '.' && id !== '..' ? id : invalid()
}

/** 版本号用于校验归档格式兼容性；字段结构由各字段的校验函数保证。 */
export const checkManifest = (value: unknown): void => {
  const version = record(value).export_format_version
  if (typeof version === 'number' && version > EXPORT_FORMAT_VERSION) {
    fail('backupNewerVersion')
  }
  if (version !== EXPORT_FORMAT_VERSION) {
    fail('backupInvalidVersion')
  }
}

export const readSessionIndex: Read<SessionIndexEntry[]> = list((value) => {
  const item = record(value)
  sessionId(item.id)
  nullable(string)(item.title)
  count(item.message_count)
  time(item.inserted_at)
  time(item.updated_at)
  // 归档里的置顶状态不导入
  return { ...item, pinned: false } as unknown as SessionIndexEntry
})

export const readSessionFile: Read<SessionFile> = (value) => {
  const item = record(value)
  sessionId(item.id)
  nullable(string)(item.title)
  count(item.current_message_id)
  time(item.inserted_at)
  time(item.updated_at)
  const messages = list(message)(item.messages)
  return { ...item, pinned: false, messages } as unknown as SessionFile
}
