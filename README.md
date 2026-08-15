# 双语口语训练

一个桌面端的英语 × 日语口语训练工具。它用同一轮语义练习两种语言，并提供角色扮演、主题讨论、语音输入/朗读、即时反馈和个人学习记录。

> 当前代码处于 `codex/ci-baseline` 改进分支；合并到 `main` 前请先审阅 Pull Request。

## 能做什么

- 自由聊天、角色扮演和主题讨论三种训练模式
- 英语 CEFR（A2–C1）与日语 JLPT（N5–N1）独立难度，可自动调整
- 录音转文字（STT）和 AI 朗读（TTS）
- 每回合的英语、日语、跨语言一致性反馈，以及易错词沉淀
- 历史记录、词汇本与学习统计
- 内置场景/主题库；可在“设置 → 自定义训练内容”中新建和删除自己的内容
- API Key 使用 Tauri Stronghold 加密保存；数据库和 localStorage 不保存明文密钥

## 运行环境

- Node.js 20 或更高版本
- Rust stable（用于 Tauri 桌面端）
- Windows 上首次编译 Tauri 可能还需要 [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

## 本地运行

```bash
npm ci
npm run tauri dev
```

仅调试前端页面可运行：

```bash
npm run dev
```

## 首次配置

1. 打开“设置”，先创建并解锁密钥保险库。
2. 填入 LLM、STT、TTS 所需的 API Key，点击“保存”。
3. 推荐使用硅基流动：同一个 Key 可用于其支持的 LLM、STT、TTS。
4. 返回训练页，选择模式、难度和可选场景/主题后开始训练。

旧版本如果曾把 API Key 写入 SQLite，下一次成功保存设置时会自动清理该明文记录。

## 数据与跨设备使用

训练数据保存在本地 SQLite 数据库中。设置页可以迁移数据库到新路径，旧文件会保留，便于回退。

**不要将正在使用的 SQLite 文件放进 OneDrive、iCloud、WebDAV 等目录做实时同步。** SQLite 不会自动合并两台设备的并发写入，可能造成损坏或丢失数据。需要转移数据时：

1. 在所有设备完全退出本应用；
2. 等待云盘同步完成；
3. 只在一台设备上再次打开应用。

应用启动时会提示检测到的外部修改，但这不是冲突合并功能。

## 质量检查

```bash
npm test
npm run build
cd src-tauri && cargo check --locked
```

GitHub Actions 会在 `main` 和 `codex/**` 分支上执行前端测试/打包以及 Windows 原生检查。

## 发布

当前版本号仍是 `0.1.0`，尚未创建正式安装包或 GitHub Release。发布前请完成真实 API 的手动验收、准备应用图标与安装包签名，并通过 Pull Request 审阅后合并。
