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

## Install as an app (PWA)

The site is installable, so it opens in its own window without browser chrome:

- **Android (Chrome)**: open the site → menu → “Install app”
- **iOS (Safari)**: open the site → Share → “Add to Home Screen”
- **Desktop (Chrome / Edge)**: the install icon in the address bar

Data still lives on the device only. Removing the icon usually keeps the data; clearing app data deletes it, so export a backup from Settings regularly (Settings → Data shows the last export time and storage usage).

On a shared computer, use Settings → Data → “Clear all local data” to wipe conversations, the API key, settings and page caches in one click; cloud records stay intact.

## Cloud sync

Generate a sync code on one device and enter the same code elsewhere to share chats:

1. Settings → Data → Cloud sync → “Generate”, keep the code safe
2. Click “Connect”, then “Upload”
3. On another device, enter the same code → “Connect” → “Restore”

Content is encrypted in the browser before upload, the server only stores ciphertext, and the API key is never synced. “Restore” replaces local chats with the cloud copy and asks for confirmation first.

## Build

```powershell
pnpm build
```

Output in `dist/` includes `index.html`, `static/`, `manifest.webmanifest`, `sw.js` and `icons/`. Open `dist/index.html` directly or deploy it to any static host.

## Differences from upstream

- **Cross-platform build**: the POSIX-only `rm -rf` and `NODE_ENV` prefix are gone from `package.json`, and `rspack.config.ts` infers the mode from the rspack subcommand, so `pnpm build` works in cmd and PowerShell
- **Usage panel left of the input**: live clock with peak / off-peak state (red / green), session spend, account balance, and the peak-hour windows converted to local time

## Note

This is not the official release; features and documentation follow upstream. Official demo and docs: <https://deepseek-ai.github.io/chat-demo/> .

## License

MIT, inherited from upstream. See [LICENSE](LICENSE).