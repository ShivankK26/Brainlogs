import type { SourceKind, SpoolRecord } from "@brainlog/types";

export type AppClass = "browser" | "terminal" | "editor" | "chat" | "other";

const BROWSERS = /\b(safari|chrome|chromium|firefox|arc|brave|edge|opera|vivaldi|zen|orion|librewolf)\b/i;
const TERMINALS = /\b(terminal|iterm2?|warp|alacritty|kitty|wezterm|ghostty|hyper|windows terminal|cmd|powershell|pwsh|konsole|gnome-terminal|tilix|foot|rio)\b/i;
const EDITORS = /\b(code|vs ?code|cursor|windsurf|zed|sublime|intellij|webstorm|pycharm|goland|rider|clion|xcode|vim|nvim|neovim|emacs|helix|textmate|nova|fleet)\b/i;
const CHAT = /\b(slack|discord|whatsapp|telegram|signal|teams|imessage|messages|wechat|line|matrix|element|zulip|mattermost)\b/i;

export function classifyApp(r: Pick<SpoolRecord, "app" | "exe" | "chat" | "source" | "url">): AppClass {
  const blob = `${r.app ?? ""} ${r.exe ?? ""}`;
  if (r.chat || CHAT.test(blob)) return "chat";
  if (r.source === "browser" || r.url || BROWSERS.test(blob)) return "browser";
  if (r.source === "terminal" || TERMINALS.test(blob)) return "terminal";
  if (EDITORS.test(blob)) return "editor";
  return "other";
}

/** Map an engine record to the canonical source kind. On-screen text is AX on macOS, OCR on Windows, AT-SPI on Linux. */
export function sourceKindFor(r: SpoolRecord, cls: AppClass, platform: NodeJS.Platform): SourceKind {
  if (cls === "terminal" && r.text) return "terminal";
  switch (r.source) {
    case "ax":
      return "ax";
    case "atspi":
      return "atspi";
    case "terminal":
      return "terminal";
    case "ocr": {
      const method = (r as Record<string, unknown>).method;
      if (method === "ocr" || platform === "win32") return "ocr";
      if (platform === "linux") return "atspi";
      return "ax";
    }
    default:
      return "title";
  }
}

export function domainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
