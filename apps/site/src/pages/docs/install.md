---
layout: ../../layouts/Docs.astro
title: Install
description: Download the desktop app, grant the one permission it needs, and start capturing.
---

# Install

Brainlogs is a direct download. There is no account, no App Store listing, and nothing to sign up for. The app bundles its own runtime: you do not need Node, Rust or a source checkout.

## macOS

**Option A — one line in Terminal** (recommended; no security dialog):

```bash
curl -fsSL https://github.com/ShivankK26/Brainlog/releases/latest/download/install.sh | sh
```

The script downloads the `.dmg`, verifies its checksum, copies `Brainlogs.app` to `/Applications` and opens it.

**Option B — the `.dmg`:** download `Brainlogs_x.y.z_universal.dmg` from the [latest release](https://github.com/ShivankK26/Brainlog/releases/latest), open it and drag **Brainlogs** to **Applications**.

Brainlogs is not signed with an Apple Developer certificate, so on first launch macOS says it "could not verify" the app. That is expected for software distributed outside the App Store:

1. Open **System Settings → Privacy & Security**.
2. Scroll to the Security section and press **Open Anyway** next to Brainlogs.
3. Confirm once. macOS remembers the choice.

Then grant **Accessibility** when prompted (System Settings → Privacy & Security → Accessibility → Brainlogs) so window titles and on-screen text can be read. No screen-recording permission is requested: Brainlogs never takes screenshots.

## Windows

Download `Brainlogs_x.y.z_x64-setup.exe` (or the `.msi`) from the [latest release](https://github.com/ShivankK26/Brainlog/releases/latest) and run it. SmartScreen may show "Windows protected your PC" for an unsigned installer: choose **More info → Run anyway**. Windows uses the built-in OCR engine on an in-memory bitmap that is never written to disk.

## Linux

`Brainlogs_x.y.z_amd64.deb` for Debian and Ubuntu (`sudo apt install ./Brainlogs_*.deb`), or the `.AppImage` for any distribution (`chmod +x` and run). Wayland sessions need `at-spi2-core` installed for on-screen text.

## Verify a download

Every release ships `SHA256SUMS.txt`:

```bash
shasum -a 256 -c SHA256SUMS.txt --ignore-missing
```

## First run

1. Open Brainlogs. The tray icon turns green when capture is active.
2. Work normally for an hour. Open the app and press <kbd>⌘K</kbd> to search.
3. Block anything you never want captured under **Data & retention**. Password managers are blocked by default.

## Local model (optional)

Install [Ollama](https://ollama.com) and pull a model for on-device summaries and answers:

```bash
ollama pull qwen2.5:7b
```

Without a model Brainlogs still captures, searches and extracts entities deterministically; **Ask** returns the closest moments instead of a written answer.

## Build from source

```bash
git clone https://github.com/ShivankK26/Brainlog && cd Brainlog
pnpm install && pnpm build
pnpm dev:worker    # local core
pnpm dev:desktop   # Tauri shell + capture engine (needs Rust)
pnpm bundle:core   # stage the sidecar Node + bundled worker the installer ships
```
