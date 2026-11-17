# 个人开发笔记

本项目 fork 自 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)，这里记录自用修改与日常 git 操作，正式说明见 [README.md](README.md)。

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
- 输入框左侧用量盒子 `StatsPanel`：输入 / 输出 token、估算消耗、缓存命中率、账户余额
- 余额取自官方 `GET /user/balance`（浏览器直连，CORS 已放行）；费用按 `src/services/chat/pricing.ts` 的单价估算