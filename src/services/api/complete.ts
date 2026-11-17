import { streamMessage } from './client.js'
import type { CreateMessageRequest, MessageUsage } from './types.js'

/** 一次性完成的文本请求：把流式事件聚合成完整文本与用量，用于摘要、记忆抽取等后台任务 */
export const collectCompletion = async (
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal
): Promise<{ text: string; usage?: MessageUsage }> => {
  let text = ''
  let usage: MessageUsage | undefined
  for await (const event of streamMessage(apiKey, body, signal)) {
    switch (event.type) {
      case 'message_start':
        usage = event.message.usage ?? usage
        break
      case 'content_block_start':
        if (event.content_block.type === 'text') {
          text += event.content_block.text
        }
        break
      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          text += event.delta.text
        }
        break
      case 'message_delta':
        usage = event.usage ?? usage
        break
    }
  }
  return { text: text.trim(), usage }
}
