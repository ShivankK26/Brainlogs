# Desktop always-on notes

The Tauri app (`apps/desktop`) registers Windows autostart via
`tauri-plugin-autostart` on first launch.

## Recommended process layout

1. **Ollama** — already a Windows service/background app.
2. **Node core** — `pnpm dev:worker` (API on `127.0.0.1:3847` + cron).
3. **Vite UI** — `pnpm dev:app` during development, or `pnpm --filter @brainlog/app preview` after build.
4. **Desktop tray** — `pnpm dev:desktop` (capture + tray + window).

## Production-ish single logon

Task Scheduler → At log on:

```
cmd /c "cd /d C:\path\to\brainlog && pnpm --filter @brainlog/worker dev"
cmd /c "cd /d C:\path\to\brainlog && pnpm --filter @brainlog/app preview"
```

Then run the packaged Tauri binary (or `pnpm --filter @brainlog/desktop tauri dev`) for capture.

Single-instance is enforced by `tauri-plugin-single-instance`.
Backups run daily via the worker cron (`schedule.backup`).
