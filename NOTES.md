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