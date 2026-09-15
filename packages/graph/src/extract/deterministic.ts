import type { EntityKind, Event } from "@brainlog/types";

export type Mention = { kind: EntityKind; name: string; confidence: number };

const REPO_URL = /https?:\/\/(?:www\.)?(?:github|gitlab|bitbucket)\.(?:com|org)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?=[/?#\s"')]|$)/g;
const GIT_REMOTE = /(?:git@(?:github|gitlab)\.com:|https?:\/\/(?:github|gitlab)\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*?)(?:\.git)?(?=[\s"')/?#]|$)/g;
const OWNER_NAME = /(?<![\w/.@-])([A-Za-z0-9][A-Za-z0-9_-]{1,38})\/([A-Za-z][A-Za-z0-9_.-]{1,60})(?![\w/])/g;
const BRANCH_CMD = /\bgit\s+(?:checkout|switch)\s+(?:-b\s+|-c\s+)?([A-Za-z0-9][\w./-]{1,80})/g;
const BRANCH_MSG = /\b(?:Switched to (?:a new )?branch|On branch)\s+'?([A-Za-z0-9][\w./-]{1,80})'?/g;
const BRANCH_PREFIX = /\b((?:feat|feature|fix|bugfix|hotfix|chore|refactor|docs|test|ci|release)\/[a-z0-9][\w.-]{1,60})\b/gi;
const AT_MENTION = /(?<![\w@])@([A-Za-z][\w.-]{1,30})\b/g;
const SPEAKER = /^\s*([A-Z][\w'’.-]{1,30}(?: [A-Z][\w'’.-]{1,30})?)\s*:\s+\S/;
const DM_TITLE = /^(?:dm|direct message|private message)\s*[·|:—-]\s*(.+)$|^(.+?)\s*[·|:—-]\s*(?:dm|direct message)$/i;
const DOC_HOSTS = /(^|\.)(notion\.so|docs\.google\.com|confluence\.[a-z]+|atlassian\.net|linear\.app|figma\.com|coda\.io|dropbox\.com\/paper|quip\.com)$/i;
const IGNORE_OWNERS = new Set(["http", "https", "src", "packages", "apps", "node_modules", "dist", "usr", "bin", "etc", "var", "home", "users", "library", "tmp", "docs", "lib", "test", "tests", "api", "app", "www", "com", "org", "io", "a", "the", "and", "or"]);
const BRANCH_OWNERS = new Set(["feat", "feature", "fix", "bugfix", "hotfix", "chore", "refactor", "docs", "test", "ci", "release", "origin", "upstream", "remotes"]);
const IGNORE_NAMES = new Set(["you", "me", "system", "user", "admin", "bot", "everyone", "channel", "here", "today", "tomorrow", "error", "warning", "note", "todo", "fixme", "http", "https"]);
/** `Label: value` lines that are not chat turns: forms, résumés, receipts, headers. */
const LABEL_WORDS = new Set(["role", "location", "experience", "resume", "qualification", "qualifications", "build", "skills", "education", "summary", "subject", "from", "to", "cc", "bcc", "date", "status", "total", "price", "name", "email", "phone", "address", "company", "title", "description", "salary", "ctc", "notice", "type", "category", "position", "department", "duration", "budget", "deadline", "priority", "owner", "assignee", "reporter", "version", "url", "link", "source", "target", "input", "output", "result", "results", "step", "steps", "example", "examples", "usage", "warning", "info", "debug", "tip", "hint", "answer", "question", "q", "a", "re", "fwd", "sent", "received", "time", "amount", "quantity", "id", "order", "invoice", "batch", "register", "username", "password", "login", "account"]);
const SELF = /^(you|me|myself|i)$/i;
/** A real chat turn usually says something; "Location: Bangalore" does not. */
export const CHAT_TURN_MIN_WORDS = 4;

export function normName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function add(out: Map<string, Mention>, m: Mention): void {
  const key = `${m.kind}:${normName(m.name)}`;
  const cur = out.get(key);
  if (!cur || cur.confidence < m.confidence) out.set(key, m);
}

/** Deterministic entity mentions for one event: repos, branches, docs, people. Confidence 1 means "certain". */
export function extractMentions(e: Event, opts: { chat: boolean }): Mention[] {
  const out = new Map<string, Mention>();
  const blob = `${e.windowTitle}\n${e.url ?? ""}\n${e.text}`;

  for (const m of blob.matchAll(REPO_URL)) add(out, { kind: "repo", name: `${m[1]}/${m[2]}`, confidence: 1 });
  for (const m of blob.matchAll(GIT_REMOTE)) add(out, { kind: "repo", name: `${m[1]}/${m[2]}`, confidence: 1 });
  if (e.sourceKind === "terminal") {
    for (const m of e.text.matchAll(OWNER_NAME)) {
      const owner = m[1]!;
      const repoName = m[2]!.replace(/\.git$/, "");
      if (IGNORE_OWNERS.has(owner.toLowerCase()) || BRANCH_OWNERS.has(owner.toLowerCase()) || /^\d+$/.test(owner) || /\.(ts|js|tsx|rs|md|json|py|go|yml|yaml|css|html)$/i.test(repoName)) continue;
      add(out, { kind: "repo", name: `${owner}/${repoName}`, confidence: 0.6 });
    }
  }
  for (const m of e.text.matchAll(BRANCH_CMD)) if (!/^-/.test(m[1]!) && m[1] !== "main" && m[1] !== "master") add(out, { kind: "branch", name: m[1]!, confidence: 1 });
  for (const m of e.text.matchAll(BRANCH_MSG)) if (m[1] !== "main" && m[1] !== "master") add(out, { kind: "branch", name: m[1]!, confidence: 1 });
  for (const m of blob.matchAll(BRANCH_PREFIX)) add(out, { kind: "branch", name: m[1]!, confidence: 0.9 });

  if (e.domain && DOC_HOSTS.test(e.domain) && e.windowTitle) {
    const title = e.windowTitle.replace(/\s*[-–—|·]\s*(notion|google docs|confluence|linear|figma)\s*$/i, "").trim();
    if (title.length >= 3) add(out, { kind: "doc", name: title.slice(0, 120), confidence: 1 });
  }

  if (opts.chat) {
    for (const m of e.text.matchAll(AT_MENTION)) if (!IGNORE_NAMES.has(m[1]!.toLowerCase())) add(out, { kind: "person", name: m[1]!, confidence: 1 });
    const dm = e.windowTitle.match(DM_TITLE);
    const contact = (dm?.[1] ?? dm?.[2])?.trim();
    if (contact && !SELF.test(contact) && contact.length <= 60) add(out, { kind: "person", name: contact, confidence: 1 });
    // Chat turns repeat their speaker or say something; a one-off "Label: value" line with a
    // two-word value is a form field or résumé heading, not a person.
    const turns = new Map<string, { n: number; longest: number }>();
    for (const line of e.text.split("\n")) {
      const s = line.match(SPEAKER);
      if (!s) continue;
      const words = line.slice(line.indexOf(":") + 1).trim().split(/\s+/).filter(Boolean).length;
      const cur = turns.get(s[1]!) ?? { n: 0, longest: 0 };
      cur.n += 1;
      cur.longest = Math.max(cur.longest, words);
      turns.set(s[1]!, cur);
    }
    for (const [name, t] of turns) {
      const lower = name.toLowerCase();
      if (SELF.test(name) || IGNORE_NAMES.has(lower) || LABEL_WORDS.has(lower)) continue;
      const multiWord = /\s/.test(name);
      const isContact = contact !== undefined && normName(contact) === normName(name);
      if (t.n >= 2 || multiWord || isContact || t.longest >= CHAT_TURN_MIN_WORDS) add(out, { kind: "person", name, confidence: t.n >= 2 || isContact ? 0.95 : 0.8 });
    }
  }
  return [...out.values()];
}

export type Speaker = { name: string; self: boolean; text: string };

/** Split chat text into speaker turns using `Name: message` lines. Lines without a speaker continue the previous turn. */
export function speakerTurns(text: string): Speaker[] {
  const turns: Speaker[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(SPEAKER);
    if (m) {
      const name = m[1]!;
      turns.push({ name, self: SELF.test(name), text: line.slice(m[0].length - 1).trim() });
    } else if (turns.length) turns[turns.length - 1]!.text += `\n${line}`;
  }
  return turns;
}
