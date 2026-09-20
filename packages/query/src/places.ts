/**
 * Places, visits and change detection (ADR 0014).
 *
 * A *place* is a thing you return to: a document, a person, a repository, a site or an app.
 * Brainlogs recognises the place in front of you and hands back what it already knows about it:
 * when you were last here, what was decided, what is still open, and — because we store text and
 * not screenshots — what changed since your last visit.
 *
 * Nothing here needs a model. Everything is string work over events already in the database.
 */
import { and, desc, eq, gte, like } from "drizzle-orm";
import { brainlogSchema as s, getDb, rowToEvent } from "@brainlog/core";
import type { CommitmentStatus, Event } from "@brainlog/types";
import { commitments } from "./graph-reads.js";
import { normApp } from "./plan.js";
import { visible, type Perms } from "./filters.js";

export type PlaceKind = "doc" | "person" | "repo" | "site" | "app" | "call";

export type Place = {
  /** Stable identity: `kind:normalised-name`. Survives window-title noise and browser suffixes. */
  key: string;
  kind: PlaceKind;
  /** What to call it on screen. */
  label: string;
  /** Where it lives, for the subtitle: "notion.so", "whatsapp", "github.com". */
  where: string;
};

export type Visit = {
  start: string;
  end: string;
  ms: number;
  eventIds: string[];
  /** Longest captured text in the visit; the basis for the diff against the next one. */
  text: string;
  app: string;
};

export type Change = {
  /** Lines present now that were not there last time. */
  added: string[];
  /** Lines that were there last time and are gone now. */
  removed: string[];
  /** One sentence a person can read, or null when nothing meaningful moved. */
  summary: string | null;
};

export type Recall = {
  place: Place;
  visits: number;
  firstSeen: string | null;
  lastSeen: string | null;
  totalMs: number;
  /** The visit before the current one, which is what "since you were last here" refers to. */
  previousVisit: Visit | null;
  change: Change | null;
  /** Decisions, questions and promises found in this place's text. */
  facts: Array<{ kind: "decision" | "question" | "promise"; text: string; ts: string; eventId: string }>;
  people: string[];
  /** Open promises in either direction with the person in front of you, or with a caller. */
  owed: Owed[];
  /** Who this place is with: the counterpart of a chat, or the names on screen in a call. */
  withPeople: string[];
  eventIds: string[];
};

export type Owed = {
  id: string;
  text: string;
  /** "you" — you owe them. "them" — they owe you. */
  direction: "you" | "them";
  who: string;
  status: CommitmentStatus;
  dueAt: string | null;
};

const BROWSER_SUFFIX = /\s+[-–—|]\s+(Google Chrome|Chrome|Arc|Safari|Firefox|Microsoft Edge|Brave|Zen|Chromium)\s*$/i;
const NOISE_SUFFIX = /\s+[-–—|]\s+(High memory usage.*|\d+ (?:new )?(?:message|notification)s?.*)$/i;
const COUNT_PREFIX = /^\(\d+\+?\)\s*/;
/** Chat apps prepend direction and zero-width marks; they break every anchor and every key. */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

const BROWSER = /^(google chrome|chrome|chromium|arc|safari|firefox|microsoft edge|edge|brave|zen|opera|vivaldi)$/i;
const DOC_HOSTS = /(^|\.)(notion\.so|docs\.google\.com|sheets\.google\.com|slides\.google\.com|confluence\.[a-z.]+|atlassian\.net|linear\.app|figma\.com|coda\.io|quip\.com|dropbox\.com)$/i;
const CODE_HOSTS = /(^|\.)(github\.com|gitlab\.com|bitbucket\.org)$/i;
const CALL_HOSTS = /(^|\.)(meet\.google\.com|zoom\.us|teams\.microsoft\.com|webex\.com|whereby\.com)$/i;
const TERMINAL = /^(iterm2?|terminal|warp|alacritty|kitty|ghostty|hyper|wezterm)$/i;
/** Native apps whose windows are documents. The same page in the app and in a browser is one place. */
const DOC_APPS = /^(notion|obsidian|linear|figma|craft|bear|evernote|onenote|typora|logseq|notability|goodnotes|pages|numbers|keynote|word|excel|powerpoint)$/i;
const CHAT_APPS = /\b(whatsapp|slack|discord|telegram|signal|messages|imessage|teams|messenger)\b/i;
const CHAT_TITLE = /^(?:dm|direct message)\s*[·|:—-]\s*(.+)$|^(.+?)\s*[·|:—-]\s*(?:dm|direct message)$/i;
/**
 * What a chat window appends to a name while you are in it: the call state, the typing indicator,
 * the presence line. "Tanu — voice call" and "Tanu" are the same person, and only the name is one.
 */
const CHAT_STATE = /\s*[-–—|·•:]?\s*(?:\((?:you|online)\)|typing…?|is typing…?|online|offline|last seen[^|·]*|(?:voice|video|group)? ?calling…?|(?:incoming |outgoing |missed )?(?:voice|video) ?call(?:\.\.\.|…)?|ringing…?|connecting…?|on a call|in a call|end-to-end encrypted)\s*$/i;

function chatName(title: string): string {
  let out = title;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(CHAT_STATE, "").trim();
    if (next === out) break;
    out = next;
  }
  return out.replace(/[|·—–-]\s*$/, "").trim();
}
const REPO_PAIR = /([A-Za-z0-9][\w.-]{0,38})\/([A-Za-z][\w.-]{0,60})/;
/** Titles that identify nothing and must never become a place. */
const JUNK = new Set(["", "new tab", "untitled", "home", "loading", "loading…", "app", "apps", "inbox", "google", "search", "settings", "preferences", "menu", "window", "messages", "messaging", "chats", "startpage", "blank", "about:blank"]);

export function normKey(s: string): string {
  return s.replace(INVISIBLE, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Strip the browser, the unread counter, the memory-usage noise and invisible marks. */
export function placeTitle(title: string): string {
  return (title || "")
    .replace(INVISIBLE, "")
    .replace(COUNT_PREFIX, "")
    .replace(NOISE_SUFFIX, "")
    .replace(BROWSER_SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

function junk(label: string): boolean {
  const n = normKey(label);
  return n.length < 2 || JUNK.has(n) || /^[\d\s\p{P}]+$/u.test(n);
}

export type WindowLike = { app: string; windowTitle: string; url?: string | null; domain?: string | null; text?: string };

/**
 * Identify the place in front of the user.
 *
 * Browser pages are keyed by their cleaned title alone (`page:…`), never by domain: the same page
 * arrives both as a window capture with no domain and as a history row with one, and those have to
 * be the same place. The domain, when present, only upgrades the *kind* to doc, repo or call.
 */
export function placeOf(w: WindowLike): Place | null {
  const app = normApp((w.app || "").replace(INVISIBLE, "").trim());
  const title = placeTitle(w.windowTitle || "");
  const domain = (w.domain ?? "").toLowerCase().replace(/^www\./, "");

  if (CHAT_APPS.test(app)) {
    const dm = title.match(CHAT_TITLE);
    const who = chatName(placeTitle((dm?.[1] ?? dm?.[2] ?? title) ?? "").replace(CHAT_APPS, "").replace(/[|·—-]\s*$/, "").trim());
    if (!junk(who) && who.length <= 60) return { key: `person:${normKey(who)}`, kind: "person", label: who, where: app.toLowerCase() };
    return null; // a chat window with no readable counterpart is not a place
  }

  if (DOC_APPS.test(app) && !domain) {
    if (junk(title)) return null;
    const label = title.replace(/\s*[-–—|·]\s*(Notion|Obsidian|Linear|Figma|Craft)\s*$/i, "").trim();
    if (junk(label)) return null;
    return { key: `page:${normKey(label)}`, kind: "doc", label, where: app.toLowerCase() };
  }

  if (BROWSER.test(app) || domain) {
    if (junk(title)) return null;
    const kind: PlaceKind = CALL_HOSTS.test(domain) ? "call" : CODE_HOSTS.test(domain) && REPO_PAIR.test(title) ? "repo" : DOC_HOSTS.test(domain) ? "doc" : "site";
    const label =
      kind === "repo"
        ? `${title.match(REPO_PAIR)![1]}/${title.match(REPO_PAIR)![2]}`
        : kind === "doc"
          ? title.replace(/\s*[-–—|·]\s*(Notion|Google Docs|Google Sheets|Confluence|Linear|Figma)\s*$/i, "").trim()
          : title;
    if (junk(label)) return null;
    return { key: `page:${normKey(kind === "repo" ? label : title)}`, kind, label, where: domain || app.toLowerCase() };
  }

  if (TERMINAL.test(app)) {
    const m = title.match(REPO_PAIR);
    if (m) return { key: `repo:${normKey(`${m[1]}/${m[2]}`)}`, kind: "repo", label: `${m[1]}/${m[2]}`, where: "terminal" };
    // "brainlog — zsh" or "~/Dev Work/Brainlog"; take the last meaningful path or name segment
    const seg = (title.split(/[—·|]/)[0] ?? "").replace(/^[^\p{L}\p{N}~/.]+/u, "").trim().split("/").filter(Boolean).pop() ?? "";
    if (junk(seg) || /^(zsh|bash|fish|node|nvim|vim|ssh)$/i.test(seg)) return null;
    // A single token is a directory, so a repository; a phrase is a working session, not a repo.
    return /\s/.test(seg)
      ? { key: `app:terminal|${normKey(seg)}`, kind: "app", label: seg, where: "terminal" }
      : { key: `repo:${normKey(seg)}`, kind: "repo", label: seg, where: "terminal" };
  }

  if (junk(title)) return null;
  return { key: `app:${normKey(app)}|${normKey(title)}`, kind: "app", label: title, where: app.toLowerCase() };
}

/** Events that might belong to this place, cheap enough to run on every window change. */
function candidateEvents(place: Place, sinceIso: string, limit = 800): Event[] {
  const db = getDb();
  const rows = db
    .select()
    .from(s.events)
    .where(
      and(
        gte(s.events.ts, sinceIso),
        like(s.events.windowTitle, `%${place.label.slice(0, 40)}%`),
      ),
    )
    .orderBy(desc(s.events.ts))
    .limit(limit)
    .all();
  return rows.map(rowToEvent).filter((e) => placeOf(e)?.key === place.key);
}

const VISIT_GAP_MS = 10 * 60_000;

/** Group a place's events into visits. Oldest first. */
export function visitsOf(events: Event[]): Visit[] {
  const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
  const out: Visit[] = [];
  for (const e of sorted) {
    const t = Date.parse(e.ts);
    const cur = out[out.length - 1];
    if (cur && t - Date.parse(cur.end) <= VISIT_GAP_MS) {
      cur.end = e.ts;
      cur.ms = Math.max(30_000, Date.parse(cur.end) - Date.parse(cur.start));
      cur.eventIds.push(e.id);
      if (e.text.length > cur.text.length) cur.text = e.text;
      continue;
    }
    out.push({ start: e.ts, end: e.ts, ms: 30_000, eventIds: [e.id], text: e.text, app: normApp(e.app) });
  }
  return out;
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 3 && l.length <= 400);
}

/** The label a line starts with: the first word, or the first two when the first is short. */
function lineHead(l: string): string {
  const words = l.toLowerCase().split(/[\s:|—–-]+/).filter(Boolean);
  if (words.length === 0) return "";
  const head = words[0]!.length >= 4 ? words[0]! : words.slice(0, 2).join(" ");
  return head.length >= 4 ? head : "";
}

/** Pair an added line with the removed line it replaced, so the diff can say "X became Y". */
function pairEdits(added: string[], removed: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const used = new Set<number>();
  for (const a of added) {
    const head = lineHead(a);
    if (!head) continue;
    const i = removed.findIndex((r, idx) => !used.has(idx) && lineHead(r) === head && r.toLowerCase() !== a.toLowerCase());
    if (i >= 0) {
      used.add(i);
      pairs.push([removed[i]!, a]);
    }
  }
  return pairs;
}

function clip(s: string, n = 90): string {
  return s.length > n ? `${s.slice(0, n).trim()}…` : s;
}

/**
 * What changed between two captures of the same place. Line-level, deterministic, no model.
 * Returns null when the difference is only noise (timestamps, counters, nothing at all).
 */
export function diffText(before: string, after: string): Change | null {
  const b = new Set(lines(before));
  const a = lines(after);
  const added = a.filter((l) => !b.has(l));
  const aSet = new Set(a);
  const removed = lines(before).filter((l) => !aSet.has(l));
  if (added.length === 0 && removed.length === 0) return null;

  // Churn, not an edit: a page that moved this much is better described than quoted.
  const churn = added.length + removed.length > 12;
  const edits = churn ? [] : pairEdits(added, removed);
  const usable = edits.filter(([before, after]) => clip(before, 60) !== clip(after, 60));
  let summary: string | null = null;
  if (usable.length === 1 && added.length <= 2 && removed.length <= 2) {
    summary = `“${clip(usable[0]![0], 60)}” became “${clip(usable[0]![1], 60)}”.`;
  } else if (churn) {
    summary = `Substantially rewritten since your last visit: ${added.length} lines added, ${removed.length} gone.`;
  } else if (added.length && !removed.length) {
    summary = added.length === 1 ? `New since your last visit: “${clip(added[0]!)}”.` : `${added.length} new lines since your last visit, starting “${clip(added[0]!, 60)}”.`;
  } else if (removed.length && !added.length) {
    summary = removed.length === 1 ? `Gone since your last visit: “${clip(removed[0]!)}”.` : `${removed.length} lines removed since your last visit.`;
  } else {
    summary = `${added.length} line${added.length === 1 ? "" : "s"} added and ${removed.length} removed since your last visit.`;
  }
  return { added: added.slice(0, 8), removed: removed.slice(0, 8), summary };
}

const DECISION = /\b(?:decided|agreed|confirmed|settled|locked|final(?:ised|ized)?|approved|chose|picked|signed off)\b/i;
/** Only questions someone on this side of the screen asked; marketing pages end every line in "?". */
const QUESTION = /^(?:open question|todo|tbd|still open|question|q)\s*[:.-]|^(?:should|shall|do|does|can|could|would|why|how|when|where|who|what)\s+(?:we|i|you|they|he|she|it)\b.*\?\s*$/i;
const PROMISE = /\b(?:i(?:'| wi)ll|we(?:'| wi)ll|i'm going to|will send|will share|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|eod|next week))\b/i;

/** Sentences worth surfacing, newest first, deduplicated. */
export function factsFrom(events: Event[]): Recall["facts"] {
  const out: Recall["facts"] = [];
  const seen = new Set<string>();
  for (const e of [...events].sort((a, b) => b.ts.localeCompare(a.ts))) {
    for (const raw of lines(e.text)) {
      const kind = DECISION.test(raw) ? "decision" : QUESTION.test(raw) ? "question" : PROMISE.test(raw) ? "promise" : null;
      if (!kind) continue;
      const key = normKey(raw).slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind, text: clip(raw, 160), ts: e.ts, eventId: e.id });
      if (out.length >= 6) return out;
    }
  }
  return out;
}

const YOU = /^(you|me|i|myself|yourself|self)$/i;

/** Open promises involving any of these names, in either direction, most urgent first. */
export function owedWith(names: string[], perms: Perms, limit = 3): Owed[] {
  const wanted = names.map(normKey).filter((n) => n.length >= 3);
  if (!wanted.length) return [];
  const hit = (party: string) => {
    const n = normKey(party);
    return !YOU.test(n) && wanted.some((w) => n === w || n.includes(w) || w.includes(n));
  };
  const out: Owed[] = [];
  for (const c of commitments({}, perms)) {
    if (c.status === "done" || c.status === "dismissed") continue;
    const from = hit(c.fromParty);
    const to = hit(c.toParty);
    if (!from && !to) continue;
    out.push({ id: c.id, text: clip(c.text, 120), direction: from ? "them" : "you", who: from ? c.fromParty : c.toParty, status: c.status, dueAt: c.dueAt });
    if (out.length >= limit) break;
  }
  return out;
}

/** People the graph already knows whose names appear in this text. Used to read a call's roster. */
export function peopleIn(text: string, limit = 6): string[] {
  const body = normKey(text);
  if (body.length < 3) return [];
  const known = getDb().select().from(s.entities).where(eq(s.entities.kind, "person")).orderBy(desc(s.entities.mentionCount)).limit(400).all();
  const out: string[] = [];
  for (const e of known) {
    const n = normKey(e.name);
    if (n.length < 4 || !/\s/.test(n)) continue; // a single first name matches too much to be evidence
    if (body.includes(n)) out.push(e.name);
    if (out.length >= limit) break;
  }
  return out;
}

export type RecallDeps = { now?: Date; days?: number };

/**
 * Everything Brainlogs knows about the place in front of you. `w.text` is the text on screen
 * right now, when the caller has it; without it the newest stored capture is used instead.
 */
export function recall(w: WindowLike, perms: Perms, deps: RecallDeps = {}): Recall | null {
  const place = placeOf(w);
  if (!place) return null;
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - (deps.days ?? 60) * 86_400_000).toISOString();
  const events = candidateEvents(place, since).filter((e) => visible(e, perms));
  const visits = visitsOf(events);
  const current = visits[visits.length - 1] ?? null;
  const previous = visits.length >= 2 ? visits[visits.length - 2]! : null;

  // Only stable surfaces are worth diffing. A terminal scrolls, a chat appends, a call is live:
  // reporting "34 lines removed" there is noise dressed up as insight.
  const diffable = place.kind === "doc" || place.kind === "site" || place.kind === "repo";
  const nowText = (w.text ?? current?.text ?? "").trim();
  const change = diffable && previous && nowText ? diffText(previous.text, nowText) : null;

  const people = [...new Set(events.flatMap((e) => (e.sensitivity === "third_party_private" ? [placeOf(e)?.label].filter((x): x is string => Boolean(x)) : [])))].slice(0, 4);

  // Who you are with. A chat names its counterpart; a call has its roster on screen.
  const withPeople = place.kind === "person" ? [place.label] : place.kind === "call" ? peopleIn(nowText || current?.text || "") : [];
  const owed = withPeople.length ? owedWith(withPeople, perms) : [];

  // A conversation is somebody else's words. We report that it happened and what it obliged, and
  // leave the words themselves on their screen, where they were said.
  const quotable = place.kind !== "person" && place.kind !== "call";

  return {
    place,
    visits: visits.length,
    firstSeen: visits[0]?.start ?? null,
    lastSeen: current?.end ?? null,
    totalMs: visits.reduce((n, v) => n + v.ms, 0),
    previousVisit: previous,
    change,
    facts: quotable ? factsFrom(events) : [],
    people,
    owed,
    withPeople,
    eventIds: events.slice(0, 40).map((e) => e.id),
  };
}

export type PlaceSummary = Place & {
  visits: number;
  lastSeen: string;
  totalMs: number;
  /** Visits per day for the last seven days, oldest first, for the sparkline. */
  week: number[];
  eventId: string;
};

/** Every place seen in the window, most recently visited first. Powers the Places screen. */
export function places(input: { days?: number; kind?: PlaceKind; limit?: number }, perms: Perms, now = new Date()): PlaceSummary[] {
  const days = input.days ?? 30;
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = getDb().select().from(s.events).where(gte(s.events.ts, since)).orderBy(desc(s.events.ts)).limit(20_000).all();
  const byKey = new Map<string, { place: Place; events: Event[] }>();
  for (const r of rows) {
    const e = rowToEvent(r);
    if (!visible(e, perms)) continue;
    const p = placeOf(e);
    if (!p) continue;
    const cur = byKey.get(p.key);
    if (cur) cur.events.push(e);
    else byKey.set(p.key, { place: p, events: [e] });
  }
  const dayKey = (iso: string) => new Date(iso).toDateString();
  const last7 = Array.from({ length: 7 }, (_, i) => dayKey(new Date(now.getTime() - (6 - i) * 86_400_000).toISOString()));
  const out: PlaceSummary[] = [];
  for (const { place, events } of byKey.values()) {
    if (input.kind && place.kind !== input.kind) continue;
    const vs = visitsOf(events);
    if (vs.length === 0) continue;
    const week = last7.map((d) => vs.filter((v) => dayKey(v.start) === d).length);
    out.push({
      ...place,
      visits: vs.length,
      lastSeen: vs[vs.length - 1]!.end,
      totalMs: vs.reduce((n, v) => n + v.ms, 0),
      week,
      eventId: vs[vs.length - 1]!.eventIds[0]!,
    });
  }
  out.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return out.slice(0, input.limit ?? 60);
}

export type PlaceHistory = {
  place: Place;
  visits: Array<Visit & { change: Change | null }>;
  facts: Recall["facts"];
  /** Open promises with this person, or with the people a call names. Empty for other places. */
  owed: Owed[];
};

/** One place and every visit to it, each annotated with what was different that time. */
export function placeHistory(key: string, perms: Perms, now = new Date(), days = 60): PlaceHistory | null {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = getDb().select().from(s.events).where(gte(s.events.ts, since)).orderBy(desc(s.events.ts)).limit(20_000).all();
  const events: Event[] = [];
  let place: Place | null = null;
  for (const r of rows) {
    const e = rowToEvent(r);
    if (!visible(e, perms)) continue;
    const p = placeOf(e);
    if (!p || p.key !== key) continue;
    place = p;
    events.push(e);
  }
  if (!place) return null;
  const vs = visitsOf(events);
  const diffable = place.kind === "doc" || place.kind === "site" || place.kind === "repo";
  const annotated = vs.map((v, i) => ({ ...v, change: i === 0 || !diffable ? null : diffText(vs[i - 1]!.text, v.text) }));
  const quotable = place.kind !== "person" && place.kind !== "call";
  const withPeople = place.kind === "person" ? [place.label] : place.kind === "call" ? peopleIn(vs[vs.length - 1]?.text ?? "") : [];
  return {
    place,
    visits: annotated.reverse(),
    facts: quotable ? factsFrom(events) : [],
    owed: withPeople.length ? owedWith(withPeople, perms, 8) : [],
  };
}
