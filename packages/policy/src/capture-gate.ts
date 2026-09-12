import type { Policy, Sensitivity } from "@brainlog/types";
import { isBlocked, type Surface } from "./blocklist.js";
import { classifySensitivity } from "./sensitivity.js";

export type CaptureGateInput = Surface & { text: string; windowTitle?: string | null; chat?: boolean };

export type CaptureGateDecision =
  | { action: "drop"; reason: "blocked_app" | "blocked_domain" | "credential" }
  | { action: "store"; sensitivity: Exclude<Sensitivity, "credential"> };

/**
 * Runs before anything touches disk (§7). Blocked surfaces are dropped, credentials
 * are dropped, everything else is stored with its sensitivity tag.
 */
export function captureGate(policy: Policy, input: CaptureGateInput): CaptureGateDecision {
  if (isBlocked({ blockedApps: policy.blockedApps, blockedDomains: [] }, input)) return { action: "drop", reason: "blocked_app" };
  if (isBlocked({ blockedApps: [], blockedDomains: policy.blockedDomains }, input)) return { action: "drop", reason: "blocked_domain" };
  const sensitivity = classifySensitivity({ text: input.text, app: input.app, windowTitle: input.windowTitle, chat: input.chat });
  if (sensitivity === "credential") return { action: "drop", reason: "credential" };
  return { action: "store", sensitivity };
}
