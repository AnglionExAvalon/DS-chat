# DS-chat

English | [简体中文](README.zh-CN.md)

Personal fork of the DeepSeek chat demo, based on [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) and **maintained for personal use and local development only**.

- Upstream: <https://github.com/deepseek-ai/chat-demo>
- This fork's deployment: <https://anglionexavalon.github.io/DS-chat/>
- Changes, git sync workflow and repository settings: see [NOTES.md](NOTES.md)

## Local development

Requires Node.js 22.12+ and pnpm.

```powershell
pnpm install
pnpm dev
```

Open <http://localhost:8090>. **This address only works on your own machine**: `localhost` points at the visitor's own computer, and the dev server stops when the terminal closes. Share the address below with other people.

Enter a DeepSeek API key in Settings before the first chat; the key is stored in browser localStorage and never committed.

## Online

- This fork: <https://anglionexavalon.github.io/DS-chat/>
- Official demo: <https://deepseek-ai.github.io/chat-demo/>

Pushes to `main` are built and published by GitHub Actions.

## Build

```powershell
pnpm build
```

Output goes to `dist/`. Open `dist/index.html` directly or deploy it to any static host.

## Differences from upstream

- **Cross-platform build**: the POSIX-only `rm -rf` and `NODE_ENV` prefix are gone from `package.json`, and `rspack.config.ts` infers the mode from the rspack subcommand, so `pnpm build` works in cmd and PowerShell
- **Usage panel left of the input**: live clock with peak / off-peak state (red / green), session spend, account balance, and the peak-hour windows converted to local time

## Note

This is not the official release; features and documentation follow upstream. Official demo and docs: <https://deepseek-ai.github.io/chat-demo/> .

## License

MIT, inherited from upstream. See [LICENSE](LICENSE).