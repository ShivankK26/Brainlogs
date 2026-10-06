# Desktop shell notes

Read this before changing anything in `apps/desktop/src-tauri`. Tauri 2.11,
Rust, macOS first.

## The capability is the gate, not the handler

The UI is served from the local core over http, which makes it a **remote
origin**. A remote origin may invoke an app command only if a custom permission
names it. `capabilities/default.json` lists the windows (`main`, `recall`), the
remote urls (`http://127.0.0.1:*/*`), the plugin permissions, and the custom
permission `allow-widget-commands`, whose command list lives in
`permissions/widget.toml`. **Add a `#[tauri::command]` and you must add it
there too.** `apps/desktop/test/capability.test.ts` enforces this; it reads the
commands out of `main.rs` and the allow-list out of the toml and insists they
agree.

## Hidden windows stop ticking

macOS suspends the timers of a webview that is not on screen. Anything that
must keep running while invisible has to stay on screen. The strip parks as a
1×1 transparent window with `set_ignore_cursor_events(true)` rather than
calling `hide()`. If you ever add another background webview, do the same.

## Windows, focus and transparency

- The strip is built with `.transparent(true).always_on_top(true).focused(false)`
  and shown with `show()`, never `set_focus()`, so typing continues underneath.
- `transparent` requires the `macos-private-api` cargo feature **and**
  `app.macOSPrivateApi: true` in `tauri.conf.json`.
- `skip_taskbar` is not available on macOS; gate it with
  `#[cfg(not(target_os = "macos"))]`.
- `set_visible_on_all_workspaces(true)` keeps the strip with the user across
  spaces.

## Threads

`capture::foreground_window_info()` is safe from a background thread and the
capture engine already calls it that way. Window and monitor methods are not
obviously safe off the main thread, so the front-window watcher emits a plain
string and lets the webview ask for the details. Keep it that way.

## What the shell exposes

Commands live in `main.rs`: capture status and pause/resume, the core base url
and api token, widget mode and always-on-top, accessibility prompts, the strip
(`current_window`, `recall_show`, `recall_hide`, `recall_state`, `recall_mute`,
`recall_unmute`) and quit. The tray menu opens on a left click and carries the
strip's controls above capture's.

## Diagnostics that already exist

- `capture-status.json` in the data directory, rewritten every five seconds:
  accessibility, capture method, last observation, pause state, version, and
  `recall_poll_age_s`.
- The same fields reach the UI through `/api/v1/status` under `capture`.
- `desktop.log` in the data directory, but only for a failed core start.
- Every core read is written to `audit_entries`, which is the quickest way to
  tell whether a UI surface is actually calling the API.

When something in the shell appears to do nothing, add a number to the status
file before theorising. That is what turned two days of guessing into twenty
minutes of certainty.
