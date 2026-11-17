# 个人开发笔记

本项目 fork 自 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)，**仅用于个人使用与本地开发，不是官方版本**。官方功能说明见 [README.md](README.md)（已在顶部注明 fork 关系），日常 git 操作与本仓库设置记录在这里。

## 远端配置

| remote     | 地址                                       | 用途                     |
| ---------- | ------------------------------------------ | ------------------------ |
| `origin`   | `git@github.com:AnglionExAvalon/DS-chat.git` | 自己的仓库，日常 push/pull |
| `upstream` | `git@github.com:deepseek-ai/chat-demo.git`  | 官方仓库，只 fetch，不 push |

## 日常改动

```powershell
git add -A
git commit -m "feat: xxx"   # 前缀沿用 feat: / fix: / chore:
git push
```

## 同步官方更新

```powershell
git fetch upstream
git log --oneline HEAD..upstream/main    # 没有输出说明官方没有新提交

git merge upstream/main                  # 有更新时合并
git push                                 # 推到自己的仓库
```

GitHub 网页的 `Sync fork → Update branch` 效果相同，但本地合并能看到具体冲突文件，优先用本地。

## 冲突处理

冲突只会出现在「我改过、官方也改了」的文件上，目前是这些：

- `README.md`、`README.zh-CN.md`（顶部加了个人 fork 说明）
- `package.json`（build 脚本）
- `rspack.config.ts`（构建模式推断）
- `src/utils/format.ts`
- `src/services/api/types.ts`
- `src/i18n/zh.ts`、`src/i18n/en.ts`
- `src/components/session/SessionView.tsx` 及其 `.module.css`
- `src/components/session/Welcome.tsx` 及其 `.module.css`
- `src/components/base/Tooltip.module.css`

自己新增的文件（`StatsPanel`、`pricing.ts`、`balance.ts`）一般不冲突。

处理方式：打开冲突文件，保留双方需要的内容，然后

```powershell
git add <冲突文件>
git commit    # merge 提交，沿用默认信息即可
```

## 三条禁令

1. 不要 `git push upstream`：那是往官方仓库写，必然失败
2. 不要用 `git reset --hard` 或 `git push -f` 去"解决"同步问题，会丢提交
3. 撤销已推送的提交用 `git revert <commit>`，不要改写历史

## 其他常用命令

```powershell
git status                     # 当前分支与未提交改动
git diff                       # 具体改了哪些行
git log --oneline -10          # 最近提交
git switch -c feat/xxx         # 需要隔离开发时再开分支
git switch main                # 切回主线
```

## 与官方的功能差异

- 构建跨平台：`package.json` 去掉 POSIX 写法，`rspack.config.ts` 按 rspack 子命令推断 mode
- 输入框左侧信息盒 `StatsPanel`：实时钟与高峰状态（红色高峰 / 绿色空闲）、会话累计消耗、账户余额、底部高峰时段
- 余额取自官方 `GET /user/balance`（浏览器直连，CORS 已放行）；费用按 `src/services/chat/pricing.ts` 的单价估算

## 仓库可见性与 GitHub Pages

当前仓库是**私有（Private）**的，因此 `Settings → Pages` 会提示 “Upgrade or make this repository public to enable Pages”：

- 私有仓库开启 Pages 需要 GitHub Pro / Team / Enterprise（付费）
- 公开仓库开启 Pages 免费
- 私有仓库的 Actions 计入每月 2000 分钟免费额度（本项目一次构建约 30 秒，基本用不完）

所以 `.github/workflows/pages.yml` 在仓库私有的情况下每次推送都会失败（`configure-pages` 报 404）。两种处理：

| 目标 | 做法 |
| --- | --- |
| 保持私有、不部署 | 删除 `pages.yml`，或把 `on:` 改为只保留 `workflow_dispatch`；本地用 `pnpm dev` 即可 |
| 想部署到 Pages | `Settings → General → Danger Zone → Change to public`，再到 `Settings → Pages` 把 Source 选为 GitHub Actions，然后重跑 workflow；站点地址为 `https://anglionexavalon.github.io/DS-chat/` |

改公开前需确认：代码、提交历史、本文件都会公开可见（仓库内不含 API Key，Key 只保存在浏览器 localStorage）。

## PWA 与安装包

已实现 PWA，站点可装到桌面 / 主屏并以独立窗口运行：

- `src/manifest.webmanifest`：应用名、`display: standalone`、主题色、图标
- `src/sw.js`：网络优先、失败回退缓存；推送新版本刷新即生效，不会卡在旧版本
- `src/assets/icons/`：192 / 512 / maskable 512 与 iOS 的 180 图标
- `src/index.html`：manifest、`apple-touch-icon` 与 `apple-mobile-web-app-*` meta
- `src/main.tsx`：仅在生产构建注册 Service Worker，避免开发服务器被缓存干扰
- `rspack.config.ts`：CopyRspackPlugin 把上述文件复制到产物根目录，图标落在 `icons/`

注意：删除桌面/主屏图标通常不会丢数据，清除应用数据才会；设置 → 数据管理里会显示持久化状态、存储用量与上次导出时间。

Android 安装包（APK）尚未实现。计划用 Capacitor 包装现有 `dist/`，由 GitHub Actions 构建并挂到 Release 供下载；需注意 APK 内页面 origin 不同，可能要改用 `CapacitorHttp` 绕开 CORS。iOS 的 IPA 需要 Apple 开发者账号，暂不做。

## 本地数据清理

设置 → 数据管理 →「清除全部本地数据」（`src/services/reset.ts`）会：

- 清空 IndexedDB 的会话、摘要、附件与导入暂存（`db.clearAll`）
- 删除 localStorage 中所有 `chat-demo:` 前缀的键（API Key、语言、主题、同步码、导出时间等）
- 删除 Service Worker 缓存（`ds-chat` 前缀）
- 刷新页面，回到首次访问状态并重新弹出获取 API Key 的引导

云端同步记录不受影响：重新输入同步码即可恢复。确认弹窗会提示先保存同步码。

## 跨设备同步

已实现基于 Supabase 的端到端加密同步（`src/services/sync.ts`）：同步码派生邮箱/口令与 AES-GCM 密钥，云端只存密文。设置 → 数据管理 →「云同步」生成或输入同步码即可上传、恢复。

- Supabase 项目地址与 publishable key 通过 `rspack.config.ts` 的 `DefinePlugin` 注入（`__SUPABASE_URL__` / `__SUPABASE_KEY__`）
- 表结构：`public.snapshots(user_id, payload, version, updated_at)`，RLS 限定本人可读写
- 后台需关闭 Authentication → Sign In / Providers → **Confirm email**
- 上传与恢复都是整份覆盖，恢复前有二次确认
- 只同步文字与消息结构，不含图片原件；免费项目 7 天无请求会被暂停