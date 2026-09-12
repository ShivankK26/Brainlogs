---
layout: ../../layouts/Docs.astro
title: Install
description: Download the desktop app, grant the one permission it needs, and start capturing.
---

# Install

## Download

Grab the build for your platform from the [latest release](https://github.com/ShivankK26/Brainlog/releases/latest):

| Platform | File |
|---|---|
| macOS 12+ (Apple silicon and Intel) | `Brainlog_x.y.z_universal.dmg` |
| Windows 10+ | `Brainlog_x.y.z_x64-setup.msi` |
| Linux (Debian, Ubuntu) | `brainlog-desktop_x.y.z_amd64.deb` |
| Linux (any) | `brainlog-desktop_x.y.z_amd64.AppImage` |

There is no account and no sign-in. The app starts a local core on `127.0.0.1` and a tray icon.

## Permissions

- **macOS** asks for *Accessibility* so Brainlog can read window titles and on-screen text through the accessibility tree. No screen recording permission is requested: Brainlog never takes screenshots.
- **Windows** uses the built-in OCR engine on an in-memory bitmap that is never written to disk.
- **Linux** reads the AT-SPI accessibility bus. Wayland sessions need `at-spi2-core` installed.

## First run

1. Open Brainlog. The tray icon turns green when capture is active.
2. Work normally for an hour. Open the app and press <kbd>⌘K</kbd> to search.
3. Block anything you never want captured under **Data & retention** — password managers are blocked by default.

## Local model (optional)

Install [Ollama](https://ollama.com) and pull a model for on-device summaries and answers:

```bash
ollama pull qwen2.5:7b
```

Without a model Brainlog still captures, searches and extracts entities deterministically; **Ask** returns the closest moments instead of a written answer.

## Build from source

```bash
git clone https://github.com/ShivankK26/Brainlog && cd Brainlog
pnpm install && pnpm build
pnpm dev:worker    # local core
pnpm dev:desktop   # Tauri shell + capture engine (needs Rust)
```
