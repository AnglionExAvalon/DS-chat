# DS-chat

[English](README.md) | 简体中文

DeepSeek 聊天界面的个人 fork，基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) 修改，**仅用于个人使用与本地开发**。

- 原仓库：<https://github.com/deepseek-ai/chat-demo>
- 本仓库的在线体验：<https://anglionexavalon.github.io/DS-chat/>
- 自用改动、git 同步方式与仓库设置：见 [NOTES.md](NOTES.md)

## 本地开发

需要 Node.js 22.12+ 和 pnpm。

```powershell
pnpm install
pnpm dev
```

打开 <http://localhost:8090> 。**该地址仅本机可访问**：`localhost` 指向访问者自己的电脑，且开发服务器关闭终端即停止，其他人无法打开。请把下面的在线地址发给别人。

首次使用前需要在设置里填写 DeepSeek API Key，Key 只保存在浏览器 localStorage，不会进入代码仓库。

## 在线访问

- 本仓库的部署：<https://anglionexavalon.github.io/DS-chat/>
- 官方演示：<https://deepseek-ai.github.io/chat-demo/>

推送到 `main` 后由 GitHub Actions 自动构建并发布。

## 安装成 App（PWA）

站点支持 PWA，可以像 App 一样装到桌面或主屏幕，打开后没有浏览器地址栏：

- **Android（Chrome）**：打开站点 → 右上角菜单 → “安装应用”
- **iOS（Safari）**：打开站点 → 分享 → “添加到主屏幕”
- **桌面（Chrome / Edge）**：地址栏右侧的“安装”图标

安装后数据仍只保存在本机；删除图标一般不会丢数据，清除应用数据才会，建议定期用设置里的“导出”备份（设置 → 数据管理会显示上次导出时间和存储用量）。

在公共电脑上使用完，可以用 设置 → 数据管理 → “清除全部本地数据”一键清空对话、API Key、设置和页面缓存；云端同步记录不受影响。

## 跨设备同步

在一台设备生成同步码，其他设备填入同一个同步码即可共享聊天记录：

1. 设置 → 数据管理 → 云同步 → 点“生成”，保存好同步码
2. 点“连接”，再点“上传到云端”
3. 新设备输入同一个同步码 → “连接” → “从云端恢复”

聊天内容在浏览器内加密后才上传，服务端只保存密文，API Key 不会同步。“恢复”会用云端记录覆盖本地记录，操作前有确认提示。

## 构建

```powershell
pnpm build
```

产物在 `dist/`，包含 `index.html`、`static/`、`manifest.webmanifest`、`sw.js` 与 `icons/`，可直接双击 `dist/index.html` 打开，也可以部署到任意静态服务器。

## 与原仓库的差异

- **构建脚本跨平台**：`package.json` 去掉 POSIX 专属写法，`rspack.config.ts` 按 rspack 子命令推断 mode，Windows 的 cmd / PowerShell 可直接执行 `pnpm build`
- **输入框左侧信息盒**：实时钟与高峰状态（红色高峰 / 绿色空闲）、本会话累计消耗、账户余额、底部高峰时段（按本地时区换算）

## 说明

本仓库不是官方版本，功能与文档以原仓库为准。官方在线演示与文档见 <https://deepseek-ai.github.io/chat-demo/> 。

## 许可

沿用原项目的 MIT 许可，见 [LICENSE](LICENSE)。