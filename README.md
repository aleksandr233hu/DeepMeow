# DeepMeow

基于 DeepSeek 官方开源的 [chat-demo](https://github.com/deepseek-ai/chat-demo)（MIT）定制的 Android 客户端（支持鸿蒙系统）：
不登录、不使用官方免费额度，所有请求使用 DeepSeek API Key，会话与个性化数据只保存在本机。

## 功能

- **接入 API Key**：设置里随时修改，可测试 `deepseek-flash` 与 `deepseek-v4-pro` 的连通性
- **完全本地**：会话、记忆、人格预设、头像都存在设备本地
- **对话**：流式输出、深度思考、联网搜索、Markdown / KaTeX / Mermaid
- **多会话**：消息分支、消息就地编辑、删除与撤销、从某轮新建对话、长对话压缩
- **文件与图片**：拍照 / 相册 / 文件三类上传，图片可被视觉理解
- **语音**：语音输入与朗读
- **个性化**：自定义指令、人格预设、长期记忆、六项回答风格、温度与 top_p
- **数据管理**：导入 DeepSeek 官方导出的历史对话 ZIP（合并追加，支持暂停 / 继续 / 取消）、完整备份导出
- **猫主题**：英短蓝猫配色、圆体字（可切换系统字体）、猫耳与爪印

更细的说明见 [CUSTOM.md](CUSTOM.md)。

## 安装

从 [Releases](../../releases) 下载 APK 直接安装，支持 Android 7.0 及以上（minSdk 24）。

首次打开会要求填写 API Key，保存后进入对话界面；之后启动直接进入欢迎页。

## 构建

需要 Node.js 22、pnpm、JDK 21 与 Android SDK。

```sh
pnpm install
pnpm build
pnpm exec cap sync android
cd android && ./gradlew assembleRelease
```

产物在 `android/app/build/outputs/apk/release/app-release.apk`。

## 数据与隐私

- API Key 保存在设备本地（localStorage），请求由设备直连 `https://api.deepseek.com`
- 会话与附件保存在 IndexedDB，导出备份的 ZIP 不包含 API Key
- 卸载应用会删除全部本地数据

## 许可证

[MIT](LICENSE)，基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)（Copyright © 2026 DeepSeek）。

内置字体 ZCOOL KuaiLe 采用 SIL OFL 1.1 许可。
