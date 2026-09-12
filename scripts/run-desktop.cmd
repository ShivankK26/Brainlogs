@echo off
cd /d "%~dp0.."
call pnpm --filter @brainlog/desktop tauri dev
