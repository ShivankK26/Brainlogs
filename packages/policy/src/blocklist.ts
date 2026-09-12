import type { Policy } from "@brainlog/types";

export type Surface = { app?: string | null; exe?: string | null; bundleId?: string | null; domain?: string | null; url?: string | null };

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/** App rules match case-insensitively as substrings of the app name, executable or bundle id. */
export function isBlockedApp(policy: Pick<Policy, "blockedApps">, s: Surface): boolean {
  const hay = [norm(s.app), norm(s.exe), norm(s.bundleId)].filter(Boolean);
  if (hay.length === 0) return false;
  return policy.blockedApps.some((rule) => {
    const r = norm(rule);
    return r.length > 0 && hay.some((h) => h.includes(r));
  });
}

/** Domain rules: `bank.com` matches bank.com and any subdomain; `*.bank.com` matches subdomains only. */
export function isBlockedDomain(policy: Pick<Policy, "blockedDomains">, s: Surface): boolean {
  let domain = norm(s.domain);
  if (!domain && s.url) {
    try {
      domain = new URL(s.url).hostname.toLowerCase();
    } catch {
      domain = "";
    }
  }
  if (!domain) return false;
  return policy.blockedDomains.some((rule) => {
    const r = norm(rule);
    if (!r) return false;
    if (r.startsWith("*.")) return domain.endsWith(r.slice(1));
    return domain === r || domain.endsWith(`.${r}`);
  });
}

export function isBlocked(policy: Pick<Policy, "blockedApps" | "blockedDomains">, s: Surface): boolean {
  return isBlockedApp(policy, s) || isBlockedDomain(policy, s);
}
