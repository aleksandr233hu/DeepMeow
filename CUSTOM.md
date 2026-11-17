# DeepMeow（Android）

基于官方开源的 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)（MIT）定制的纯本地客户端：
不登录、不使用官方免费额度，所有请求走自己的 DeepSeek API Key，会话与个性化数据只保存在本机。

## 功能

### 基础
- 设置里填写自己的 API Key（存 localStorage），浏览器/客户端直连 `https://api.deepseek.com`
- 流式输出、深度思考、联网搜索、阅读链接、文件/图片上传、语音输入与朗读
- 多会话、消息分支、Markdown/KaTeX/Mermaid、历史导入导出

### 生成参数与 Agent 指令
- **温度 / top_p**：全局默认值 + 每个会话独立覆盖，可一键应用到所有会话
- **Agent 自定义指令**：设置 →「自定义」→「Agent 指令」，全局默认 + 单会话覆盖；组装在基础身份之后、人格之前
- **身份来源二选一**：人格预设 / Agent 指令只发送一个；全局默认 + 单会话覆盖，未选的一侧不进入请求
- 设置里会提示服务端限制：思考模式温度固定 1；flash 非思考模式 top_p 固定 1

### 上下文用量
- 输入框右侧圆环显示已用上下文（约 1M 上限），超过 80% / 95% 变色
- 点击查看已用、剩余、输入、缓存读写、输出；可从这里直接压缩对话

### 消息显示
- 经典（无气泡平铺）/ 气泡两种布局
- 显示头像（助手默认使用 DeepSeek 官方蓝鲸 logo 的白色圆底，用户默认昵称首字并带猫耳），支持上传本地图片自定义用户/助手中任意一个，可恢复默认
- 系统提示词卡片可显示/隐藏，展开可查看实际发送内容
- 消息区滚动后提供「回到顶部」浮动按钮

### 默认主题与字体
- 默认「英短蓝猫」主题：蓝灰 + 奶油白 + 金色眼睛，侧栏爪印纹理、猫耳品牌标记、欢迎页猫咪吉祥物、气泡猫耳/爪印细节
- UI 与消息正文使用站酷快乐体（ZCOOL KuaiLe，SIL OFL 1.1）；字体与许可证位于 `src/assets/fonts/`，代码块仍使用等宽字体
- 助手默认头像使用 DeepSeek 官网 favicon 的蓝鲸 logo

### 回答风格
- 与 ChatGPT 对齐的六项配置：基础风格和语气（七种预设）+ 亲切程度、热情程度、表情符号、可视化回答、标题和列表（各三档：增强/默认/减弱）
- 全局默认 + 单会话覆盖
- 属于提示词层面的软约束，会追加到系统提示词，不改变温度等采样参数

### 对话编辑
- **删除单条消息**：会话内任意一条消息，删除后子分支自动接回父节点；Toast 可撤销
- **删除整个会话**：会话列表菜单
- **就地编辑模型回复**：替换回复正文，保留思考与工具块；修改后的内容进入后续上下文，不重新生成
- **编辑用户消息**：沿用官方行为，新增一个版本并重新生成回答
- **从这里新建对话**：勾选此前任意完整对话组（可不连续），复制到新会话；目标回答所在组也可取消，取消时目标回答单独附在结尾

### 压缩与折叠
- **上下文摘要压缩**：保留最近 3 轮，较早对话交给 `deepseek-flash` 总结后注入系统提示词
- 摘要卡片支持查看摘要、展开原文、恢复原文、重新压缩
- **长消息折叠**：超过约 420px 默认折叠，可展开；设置中可关闭
- **单会话导出**：会话工具栏「更多 → 导出此对话」，生成可导入的 ZIP

### 长期记忆与自定义
- **长期记忆**：自动提取（默认每 2 轮一次，可在设置关闭）+ 手动「记住这条」
- 记忆管理页：新增、编辑、逐条启停、删除；注入时最多 40 条 / 1500 字
- **自定义指令**：称呼、身份/职业、关于我、希望的回答方式、回答风格
- **人格预设**：4 套内置人格，可新建、编辑、复制、删除；每个会话可单独切换
- **外观**：强调色、消息字号、用户气泡宽度、深浅色主题

### 纯本地
- 会话、附件、记忆、人格全部存 IndexedDB；设置存 localStorage
- 无账号、无云同步、无埋点；仅联网搜索/文件解析等能力会把必要内容发给 DeepSeek API

## 本地开发

需要 Node.js ≥ 22.12 与 pnpm。

```bash
pnpm install
pnpm dev        # http://localhost:8090
pnpm type       # TypeScript 检查
pnpm lint       # oxlint
pnpm test       # Node 内置测试 + TS 加载器
pnpm build      # 产出 dist/
```

首次启动会打开设置并要求输入 API Key；Key 只保存在当前浏览器/客户端的本地存储中。

## Android 打包

工程已包含 Capacitor 8 与 Android 平台（`android/`）。要求 JDK 21、Android SDK 36、Gradle 8.14.3（Gradle wrapper 会自动下载）。

```bash
pnpm build
pnpm exec cap sync android
cd android
./gradlew assembleDebug      # 调试包
./gradlew assembleRelease    # 正式包（需签名配置）
```

产物：
- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/apk/release/app-release.apk`

### 签名与升级
- 应用显示名：`DeepMeow`；包名保持不变：`com.deepseek.local`（在 `capacitor.config.ts` 与 `android/app/build.gradle` 中）
- 签名文件：`android/keystore/deepseek-local.keystore` 与同目录的 `keystore.properties`（均不提交到 git）
- **同包名 + 同签名**覆盖安装才会保留本地数据；换签名必须卸载，数据会丢失，请备份 keystore
- 正式包安装前先卸载调试包（两者签名不同）

### 图标与启动图
`python scripts/generate_icons.py` 从 `resources/cat-mascot-master.png`（吉祥物矢量渲染的透明母版）生成 `android/app/src/main/res` 下的图标与启动图；猫占 72dp 安全区的比例、背景色与启动图尺寸都在脚本顶部常量里调整。

## 已知限制
- 官方历史 ZIP 格式不包含编辑标记、压缩摘要、记忆与人格；导入导出只保证对话正文与附件
- 自动记忆提取与上下文压缩会额外消耗少量 Token
- 移动端 WebView 的麦克风权限、文件选择器行为与系统版本有关，需真机验证
- 不支持 iOS 打包（需要 macOS）

## 上游与许可
- 上游：https://github.com/deepseek-ai/chat-demo （MIT）
- 本仓库保留上游 `upstream` 远端，定制内容在 `custom` 分支
- UI 字体：ZCOOL KuaiLe（站酷快乐体），SIL OFL 1.1，许可证见 `src/assets/fonts/OFL.txt`
- DeepSeek 名称与蓝鲸 logo 归深度求索所有；本项目仅作个人本地使用，请勿对外分发官方素材
