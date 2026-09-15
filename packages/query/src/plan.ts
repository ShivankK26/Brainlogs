/**
 * Question planning without a language model.
 *
 * A question becomes (intent, subject terms, time scope). Search hits are collapsed into
 * *moments* (consecutive captures of the same window) and the answer is composed from those:
 * a verdict for yes/no questions, a time for "when", a total for "how long", a day summary for
 * "what did I do", an entity card for "who is", grouped moments otherwise. Every claim cites
 * the moment it came from; nothing is inferred beyond what the captures show.
 */
import type { Event } from "@brainlog/types";
import type { SearchHit } from "./types.js";

export type Intent = "when" | "contact" | "duration" | "day" | "who" | "find";
export type Scope = { from?: string; to?: string; label?: string };
export type Plan = { intent: Intent; subject: string; scope: Scope; question: string };

export type MomentKind = "message" | "meeting" | "doc" | "code" | "mail" | "page" | "app";
export type AskMoment = {
  eventId: string;
  eventIds: string[];
  start: string;
  end: string;
  count: number;
  title: string;
  app: string;
  domain: string | null;
  kind: MomentKind;
  sensitivity: Event["sensitivity"];
};

export type Structured = {
  intent: Intent;
  verdict: string;
  detail?: string;
  facts: Array<{ label: string; value: string; eventId?: string }>;
  moments: AskMoment[];
  scope: Scope;
};

const CONTACT = /\b(reach(ed)?\s*out|reachout|messag(e|ed|ing)|dm(ed|'d)?|email(ed)?|mail(ed)?|text(ed)?|ping(ed)?|contact(ed)?|talk(ed)?|spoke|speak|call(ed)?|meet|met|repl(y|ied)|respond(ed)?|follow(ed)?\s*up|wrote|write|sent|send|chat(ted)?)\b/i;
const DURATION = /\b(how\s+(much|long|many\s+(hours|minutes|times))|time\s+(did|have)\s+i\s+spen[dt]|spent)\b/i;
const DAY = /\b(what\s+(did|was|have)\s+i\s+(do|doing|done|work(ed)?(\s+on)?)|what\s+happened|summar(y|ise|ize)|recap)\b/i;
const WHO = /^\s*(who\s+is|who'?s|what\s+do\s+i\s+know\s+about|tell\s+me\s+about|what\s+is)\b/i;
const YESNO = /^\s*(did|have|had|has|was|were|do|does|am|is|are)\s+(i|we)\b/i;

const NOISE = new Set([
  "i", "we", "me", "my", "our", "you", "did", "do", "does", "have", "has", "had", "was", "were", "is", "are", "am", "the", "a", "an", "to", "with", "about",
  "on", "in", "at", "of", "for", "from", "and", "or", "when", "what", "who", "how", "much", "long", "many", "time", "times", "spend", "spent", "ever",
  "any", "anything", "something", "yet", "already", "recently", "last", "this", "that", "it", "him", "her", "them", "back", "up", "out", "there", "here",
]);

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Pull a time phrase out of the question. Returns the scope and the question with the phrase removed. */
export function parseScope(question: string, now = new Date()): { scope: Scope; rest: string } {
  const q = question.toLowerCase();
  const today = startOfDay(now);
  const range = (from: Date, to: Date, label: string, m: RegExpMatchArray): { scope: Scope; rest: string } => ({
    scope: { from: from.toISOString(), to: to.toISOString(), label },
    rest: question.replace(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " "),
  });
  let m: RegExpMatchArray | null;
  if ((m = q.match(/\btoday\b/))) return range(today, addDays(today, 1), "today", m);
  if ((m = q.match(/\byesterday\b/))) return range(addDays(today, -1), today, "yesterday", m);
  if ((m = q.match(/\b(this|the\s+past|past)\s+week\b/))) {
    const dow = (today.getDay() + 6) % 7;
    return range(addDays(today, -dow), addDays(today, 1), "this week", m);
  }
  if ((m = q.match(/\blast\s+week\b/))) {
    const dow = (today.getDay() + 6) % 7;
    const start = addDays(today, -dow - 7);
    return range(start, addDays(start, 7), "last week", m);
  }
  if ((m = q.match(/\b(this|past|last)\s+month\b/))) return range(addDays(today, -30), addDays(today, 1), "the last 30 days", m);
  if ((m = q.match(/\b(in\s+the\s+)?(last|past)\s+(\d+)\s+(day|days|hour|hours)\b/))) {
    const n = Number(m[3] ?? 1);
    const unit = m[4] ?? "days";
    const hours = unit.startsWith("hour");
    const from = hours ? new Date(now.getTime() - n * 3_600_000) : addDays(today, -n);
    return range(from, addDays(today, 1), `the last ${n} ${unit}`, m);
  }
  if ((m = q.match(/\b(on\s+|last\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    const want = DAYS.indexOf(m[2] ?? "");
    let d = today;
    for (let i = 0; i < 7; i++) {
      d = addDays(today, -i);
      if (d.getDay() === want) break;
    }
    if (m[1]?.trim() === "last" && d.getTime() === today.getTime()) d = addDays(d, -7);
    return range(d, addDays(d, 1), dayLabel(d), m);
  }
  if ((m = q.match(/\b(on\s+)?(\d{1,2})(st|nd|rd|th)?\s+(of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/)) || (m = q.match(/\b(on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\s+(\d{1,2})(st|nd|rd|th)?\b/))) {
    const g2 = m[2] ?? "";
    const dayStr = /^\d/.test(g2) ? g2 : (m[3] ?? "1");
    const monStr = /^\d/.test(g2) ? (m[5] ?? "") : g2;
    const mon = MONTHS.findIndex((x) => x.startsWith(monStr.slice(0, 3)));
    const d = new Date(today.getFullYear(), mon, Number(dayStr));
    if (d > now) d.setFullYear(d.getFullYear() - 1);
    return range(d, addDays(d, 1), dayLabel(d), m);
  }
  if ((m = q.match(/\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/))) {
    const monName = m[1] ?? "";
    const mon = MONTHS.indexOf(monName);
    const d = new Date(today.getFullYear(), mon, 1);
    if (d > now) d.setFullYear(d.getFullYear() - 1);
    return range(d, new Date(d.getFullYear(), mon + 1, 1), monName, m);
  }
  return { scope: {}, rest: question };
}

export function detectIntent(question: string): Intent {
  const q = question.trim();
  if (/^\s*when\b/i.test(q)) return "when";
  if (DURATION.test(q)) return "duration";
  if (WHO.test(q)) return "who";
  if (DAY.test(q)) return "day";
  if (YESNO.test(q) && CONTACT.test(q)) return "contact";
  return "find";
}

/** What the question is about, once intent words, time phrases and filler are removed. */
export function subjectOf(rest: string, intent: Intent): string {
  let s = rest.replace(/[?!.,;:"“”]/g, " ");
  if (intent === "contact") s = s.replace(CONTACT, " ");
  if (intent === "duration") s = s.replace(DURATION, " ");
  if (intent === "day") s = s.replace(DAY, " ");
  if (intent === "who") s = s.replace(WHO, " ");
  return s
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t.toLowerCase()))
    .join(" ")
    .trim();
}

export function plan(question: string, now = new Date()): Plan {
  const intent = detectIntent(question);
  const { scope, rest } = parseScope(question, now);
  return { intent, subject: subjectOf(rest, intent), scope, question };
}

const MOMENT_GAP_MS = 10 * 60_000;

/** Strip the browser suffix and counters so "Rohit Talluri | LinkedIn - Google Chrome" groups with its siblings. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s+[-–—]\s+(Google Chrome|Chrome|Arc|Safari|Firefox|Microsoft Edge|Brave|Zen)$/i, "")
    .replace(/\s+[-–—]\s+High memory usage\s+-\s+[\d,.]+\s*[MG]B/i, "")
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function kindOf(e: Event): MomentKind {
  const t = `${e.windowTitle} ${e.domain ?? ""} ${e.url ?? ""} ${e.app}`.toLowerCase();
  if (e.sensitivity === "third_party_private" || /\b(messaging|messages|inbox\b.*(slack|discord)|whatsapp|telegram|signal|imessage|slack|discord|teams|chat)\b/.test(t)) return "message";
  if (/\b(mail\.google|outlook|gmail|inbox|mail\b)/.test(t)) return "mail";
  if (/\b(meet\.google|zoom\.us|zoom|teams\.microsoft|huddle|webex|around\.co|call\b)/.test(t)) return "meeting";
  if (/\b(github|gitlab|bitbucket|pull request|merge request|\.tsx?|\.rs\b|\.py\b|vscode|cursor|xcode|iterm|terminal|warp)\b/.test(t)) return "code";
  if (/\b(docs\.google|notion|confluence|linear|figma|\.pdf|sheet|slides)\b/.test(t)) return "doc";
  if (!e.domain && !e.url) return "app";
  return "page";
}

/** Collapse hits into moments: same app + cleaned title within 10 minutes of each other. Newest first. */
export function clusterMoments(hits: SearchHit[]): AskMoment[] {
  const sorted = [...hits].sort((a, b) => a.event.ts.localeCompare(b.event.ts));
  const out: AskMoment[] = [];
  for (const h of sorted) {
    const e = h.event;
    const title = cleanTitle(e.windowTitle) || e.domain || e.app;
    const t = Date.parse(e.ts);
    const prev = out[out.length - 1];
    if (prev && prev.app === e.app && prev.title === title && t - Date.parse(prev.end) <= MOMENT_GAP_MS) {
      prev.end = e.ts;
      prev.count += 1;
      prev.eventIds.push(e.id);
      if (e.sensitivity !== "none") prev.sensitivity = e.sensitivity;
      continue;
    }
    out.push({ eventId: e.id, eventIds: [e.id], start: e.ts, end: e.ts, count: 1, title, app: e.app, domain: e.domain ?? null, kind: kindOf(e), sensitivity: e.sensitivity });
  }
  return out.reverse();
}

export function fmtTime(ts: string): string {
  return new Date(ts).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function fmtClock(ts: string): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
export function fmtSpan(m: AskMoment): string {
  const same = new Date(m.start).toDateString() === new Date(m.end).toDateString();
  if (m.start === m.end) return fmtTime(m.start);
  return same ? `${fmtTime(m.start)}–${fmtClock(m.end)}` : `${fmtTime(m.start)} → ${fmtTime(m.end)}`;
}
export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60 ? `${min % 60} min` : ""}`.trim();
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Approximate time spent: moments contribute their span plus a floor per capture. */
export function momentsDuration(moments: AskMoment[]): number {
  return moments.reduce((n, m) => n + Math.max(Date.parse(m.end) - Date.parse(m.start), 30_000 * Math.min(m.count, 10)), 0);
}

const NONE_FOUND = "Nothing in memory matches that";

/** Compose the answer for a plan from clustered moments. `dayEvents` feeds the day summary. */
export function compose(p: Plan, moments: AskMoment[], dayEvents?: Event[]): Structured {
  const subj = p.subject ? titleCase(p.subject) : "that";
  const where = p.scope.label ? ` ${p.scope.label}` : "";
  const top = moments.slice(0, 6);
  const facts: Structured["facts"] = [];

  if (p.intent === "day") {
    const evs = dayEvents ?? [];
    if (evs.length === 0) return { intent: p.intent, verdict: `No activity captured${where}.`, facts, moments: [], scope: p.scope };
    const byApp = new Map<string, number>();
    const byTitle = new Map<string, { n: number; id: string; app: string; first: string; last: string }>();
    for (const e of evs) {
      byApp.set(e.app, (byApp.get(e.app) ?? 0) + 1);
      const t = cleanTitle(e.windowTitle) || e.domain || e.app;
      const cur = byTitle.get(t);
      if (cur) {
        cur.n++;
        cur.last = e.ts;
      } else byTitle.set(t, { n: 1, id: e.id, app: e.app, first: e.ts, last: e.ts });
    }
    const apps = [...byApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const titles = [...byTitle.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    const first = evs[0]!.ts;
    const last = evs[evs.length - 1]!.ts;
    facts.push({ label: "Active", value: `${fmtTime(first)} → ${fmtClock(last)}` });
    facts.push({ label: "Mostly in", value: apps.map(([a, n]) => `${a} (${n})`).join(", ") });
    const ms = titles.map(([title, x]) => ({ eventId: x.id, eventIds: [x.id], start: x.first, end: x.last, count: x.n, title, app: x.app, domain: null, kind: "page" as MomentKind, sensitivity: "none" as const }));
    return { intent: p.intent, verdict: `${where ? titleCase(where.trim()) : "Recently"}: ${evs.length} captures across ${byApp.size} apps.`, detail: `Top windows are listed below; click one to open it in the timeline.`, facts, moments: ms, scope: p.scope };
  }

  if (moments.length === 0) return { intent: p.intent, verdict: `${NONE_FOUND}${p.subject ? ` about ${subj}` : ""}${where}.`, detail: "Try fewer words, or a name exactly as it appears in a window title.", facts, moments: [], scope: p.scope };

  if (p.intent === "when") {
    const newest = moments[0]!;
    facts.push({ label: "Most recent", value: `${fmtSpan(newest)} · ${newest.title} (${newest.app})`, eventId: newest.eventId });
    if (moments.length > 1) facts.push({ label: "Before that", value: moments.slice(1, 3).map((m) => fmtTime(m.start)).join(", "), eventId: moments[1]!.eventId });
    const oldest = moments[moments.length - 1]!;
    if (moments.length > 2) facts.push({ label: "First seen", value: fmtTime(oldest.start), eventId: oldest.eventId });
    return { intent: p.intent, verdict: `Last ${fmtTime(newest.start)}: ${newest.title}.`, facts, moments: top, scope: p.scope };
  }

  if (p.intent === "contact") {
    const convo = moments.filter((m) => m.kind === "message" || m.kind === "mail" || m.kind === "meeting");
    if (convo.length > 0) {
      const m = convo[0]!;
      const via = m.kind === "mail" ? "by email" : m.kind === "meeting" ? "in a call" : `in ${m.title.includes("LinkedIn") ? "LinkedIn messages" : m.app}`;
      facts.push({ label: "Where", value: `${m.title} (${m.app})`, eventId: m.eventId });
      facts.push({ label: "When", value: fmtSpan(m), eventId: m.eventId });
      if (convo.length > 1) facts.push({ label: "Other times", value: convo.slice(1, 4).map((x) => fmtTime(x.start)).join(", ") });
      return { intent: p.intent, verdict: `Yes. You were in a conversation involving ${subj} ${via}, ${fmtSpan(m)}.`, detail: "Message text is kept private on this device; open the moment to read it.", facts, moments: top, scope: p.scope };
    }
    const m = moments[0]!;
    facts.push({ label: "Closest", value: `${m.title} (${m.app})`, eventId: m.eventId });
    facts.push({ label: "When", value: fmtSpan(m), eventId: m.eventId });
    return { intent: p.intent, verdict: `No conversation with ${subj} was captured${where}.`, detail: `You did open ${m.title} ${fmtSpan(m)}, but no message, email or call involving ${subj} shows up. Capture only sees windows that were on screen while Brainlogs was running.`, facts, moments: top, scope: p.scope };
  }

  if (p.intent === "duration") {
    const ms = momentsDuration(moments);
    const days = new Set(moments.map((m) => new Date(m.start).toDateString()));
    facts.push({ label: "Sessions", value: `${moments.length} across ${days.size} day${days.size === 1 ? "" : "s"}` });
    facts.push({ label: "Latest", value: fmtSpan(moments[0]!), eventId: moments[0]!.eventId });
    return { intent: p.intent, verdict: `About ${fmtDuration(ms)} on ${subj}${where}.`, detail: "Estimated from the time each window stayed on screen; short glances count as 30 seconds.", facts, moments: top, scope: p.scope };
  }

  if (p.intent === "who") {
    const apps = [...new Set(moments.map((m) => m.app))].slice(0, 3).join(", ");
    const kinds = [...new Set(moments.map((m) => m.kind))];
    const oldest = moments[moments.length - 1]!;
    facts.push({ label: "First seen", value: fmtTime(oldest.start), eventId: oldest.eventId });
    facts.push({ label: "Last seen", value: fmtTime(moments[0]!.start), eventId: moments[0]!.eventId });
    facts.push({ label: "Seen in", value: apps });
    if (kinds.includes("message") || kinds.includes("mail")) facts.push({ label: "Contact", value: "You have exchanged messages" });
    return { intent: p.intent, verdict: `${subj}: ${moments.length} moment${moments.length === 1 ? "" : "s"} in memory, most recently ${fmtTime(moments[0]!.start)}.`, facts, moments: top, scope: p.scope };
  }

  const m = moments[0]!;
  return { intent: p.intent, verdict: `${moments.length} moment${moments.length === 1 ? "" : "s"} about ${subj}${where}; latest ${fmtSpan(m)} in ${m.app}.`, facts, moments: top, scope: p.scope };
}

/** Plain-text rendering for CLI and MCP callers. Citations index into `moments`. */
export function renderText(s: Structured): string {
  const lines = [s.verdict];
  if (s.detail) lines.push(s.detail);
  for (const f of s.facts) lines.push(`${f.label}: ${f.value}`);
  s.moments.forEach((m, i) => lines.push(`[${i + 1}] ${fmtSpan(m)} · ${m.app} · ${m.title}${m.count > 1 ? ` (${m.count} captures)` : ""}`));
  return lines.join("\n");
}
