import type { Event } from "@brainlog/types";
import { parseDue } from "../due.js";
import { speakerTurns } from "./deterministic.js";

export type CommitmentCandidate = {
  text: string;
  fromParty: string;
  toParty: string;
  dueAt: string | null;
  intent: "promise" | "request";
  confidence: number;
  eventId: string;
};

const PROMISE = /\b(?:i(?:'| wi)ll|i will|i can|i'm going to|i am going to|i'll get you|will do|on it|let me|i'll send|i'll share|i'll have|going to)\b/i;
const REQUEST = /\b(?:can (?:you|someone|anyone)|could (?:you|someone)|would you|please|need (?:you|someone) to|mind (?:sending|reviewing|looking)|any chance|do you have|when can you)\b/i;
const NOISE = /\b(?:lol|haha|thanks|thank you|ok|okay|sure|yes|no)\b$/i;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[\s"'“”]+|[\s"'“”]+$/g, "").trim();
}

function otherParty(turnName: string, participants: string[], contact: string | null): string {
  const others = participants.filter((p) => p.toLowerCase() !== turnName.toLowerCase());
  return contact ?? others[0] ?? "them";
}

/**
 * Find first-person promises and requests in a chat/email event.
 * `contact` is the DM counterpart when known; `you` is the local user.
 */
export function extractCommitments(e: Event, opts: { contact: string | null; now?: Date }): CommitmentCandidate[] {
  const out: CommitmentCandidate[] = [];
  const turns = speakerTurns(e.text);
  if (turns.length === 0) return out;
  const participants = [...new Set(turns.map((t) => (t.self ? "you" : t.name)))];
  const when = opts.now ?? new Date(e.ts);
  for (const turn of turns) {
    for (const sentence of turn.text.split(/(?<=[.!?])\s+|\n/)) {
      const s = clean(sentence);
      if (s.length < 12 || s.length > 300 || NOISE.test(s)) continue;
      const isPromise = PROMISE.test(s);
      const isRequest = !isPromise && REQUEST.test(s);
      if (!isPromise && !isRequest) continue;
      const speaker = turn.self ? "you" : turn.name;
      const other = otherParty(turn.name, participants, opts.contact && !turn.self ? "you" : opts.contact);
      const dueAt = parseDue(s, when);
      out.push({
        text: s,
        fromParty: speaker,
        toParty: turn.self ? other : isRequest ? "you" : other,
        dueAt,
        intent: isPromise ? "promise" : "request",
        confidence: isPromise ? 0.9 : 0.8,
        eventId: e.id,
      });
    }
  }
  return out;
}
