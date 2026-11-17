# DS-chat

[English](README.md) | 简体中文

DeepSeek 聊天界面的个人 fork，基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) 修改，**仅用于个人使用与本地开发**。

- 原仓库：<https://github.com/deepseek-ai/chat-demo>
- 本仓库的在线体验：<https://anglionexavalon.github.io/DS-chat/>
- 自用改动、git 同步方式与仓库设置：见 [NOTES.md](NOTES.md)

## 运行

需要 Node.js 22.12+ 和 pnpm。

```powershell
pnpm install
pnpm dev
```

打开 <http://localhost:8090> 。首次使用前需要在设置里填写 DeepSeek API Key，Key 只保存在浏览器 localStorage，不会进入代码仓库。

## 构建

```powershell
pnpm build
```

产物在 `dist/`，可直接双击 `dist/index.html` 打开，也可以部署到任意静态服务器。

## 与原仓库的差异

- **构建脚本跨平台**：`package.json` 去掉 POSIX 专属写法，`rspack.config.ts` 按 rspack 子命令推断 mode，Windows 的 cmd / PowerShell 可直接执行 `pnpm build`
- **输入框左侧信息盒**：实时钟与高峰状态（红色高峰 / 绿色空闲）、本会话累计消耗、账户余额、底部高峰时段（按本地时区换算）

## 说明

本仓库不是官方版本，功能与文档以原仓库为准。官方在线演示与文档见 <https://deepseek-ai.github.io/chat-demo/> 。

## 许可

沿用原项目的 MIT 许可，见 [LICENSE](LICENSE)。