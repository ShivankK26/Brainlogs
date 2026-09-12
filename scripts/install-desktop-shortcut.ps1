# Creates a Desktop shortcut that opens Brainlogs as a desktop app (one click).
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Desktop = [Environment]::GetFolderPath("Desktop")
$LnkPath = Join-Path $Desktop "Brainlogs.lnk"
$Icon = Join-Path $Root "apps\desktop\src-tauri\icons\icon.ico"

$ExeRelease = Join-Path $Root "apps\desktop\src-tauri\target\release\brainlog-desktop.exe"
$ExeDebug = Join-Path $Root "apps\desktop\src-tauri\target\debug\brainlog-desktop.exe"
$Vbs = Join-Path $PSScriptRoot "Brainlogs.vbs"

$Wsh = New-Object -ComObject WScript.Shell
$Lnk = $Wsh.CreateShortcut($LnkPath)

if (Test-Path $ExeRelease) {
  $Lnk.TargetPath = $ExeRelease
  $Lnk.WorkingDirectory = (Split-Path $ExeRelease)
  $Lnk.Arguments = ""
  Write-Host "Shortcut points at RELEASE exe"
}
elseif (Test-Path $ExeDebug) {
  $Lnk.TargetPath = $ExeDebug
  $Lnk.WorkingDirectory = (Split-Path $ExeDebug)
  $Lnk.Arguments = ""
  Write-Host "Shortcut points at DEBUG exe"
}
else {
  $Lnk.TargetPath = "wscript.exe"
  $Lnk.Arguments = "`"$Vbs`""
  $Lnk.WorkingDirectory = $Root
  Write-Host "No .exe yet - shortcut uses Brainlogs.vbs"
  Write-Host "Build with: pnpm package:app"
}

$Lnk.WindowStyle = 7
$Lnk.Description = "Brainlogs - one-click local memory widget"
if (Test-Path $Icon) {
  $Lnk.IconLocation = "$Icon,0"
}
$Lnk.Save()

Write-Host "Desktop shortcut:"
Write-Host "  $LnkPath"
Write-Host "Double-click Brainlogs - no npm commands required."
