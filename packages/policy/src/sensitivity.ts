import type { Sensitivity } from "@brainlog/types";

/**
 * Deterministic sensitivity classifier (regex tier). A local model can refine
 * `financial`/`health` later; `credential` must stay deterministic because it
 * decides whether text is dropped before it reaches disk.
 */
const CREDENTIAL: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/,
  /\b(?:sk|rk)-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/, // OpenAI / Stripe style
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/, // Slack
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/i,
  /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|passw(?:or)?d|passphrase)\b\s*[:=]\s*["']?[^\s"']{8,}/i,
  /\b[A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_PASSWORD)=\S{8,}/, // env exports
  /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/i, // connection strings with creds
  /\b(?:otp|one[- ]time (?:code|password)|verification code)\b[^\n]{0,20}\b\d{6}\b/i,
];

const FINANCIAL: RegExp[] = [
  /\b(?:\d{4}[ -]){3}\d{4}\b/, // 16-digit card
  /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,2})?\b/, // IBAN
  /\b(?:routing number|sort code|account number|acct(?:ount)? no\.?|iban|swift|bic)\b/i,
  /\b(?:account balance|available balance|current balance|statement period|bank statement|wire transfer|direct deposit)\b/i,
  /\b(?:credit card|debit card|card ending in|cvv|cvc)\b/i,
  /\b(?:ssn|social security number|tax id|ein)\b/i,
];

const HEALTH: RegExp[] = [
  /\b(?:diagnos(?:is|ed)|prescription|prescribed|lab results?|test results?|hba1c|a1c|blood (?:pressure|sugar|glucose|test)|cholesterol|medication list|dosage|mg daily)\b/i,
  /\b(?:patient portal|mychart|after[- ]visit summary|clinical notes?|referral|therapist|therapy session|psychiatr|medical record)\b/i,
  /\b(?:pregnan|std|hiv|cancer|chemotherapy|biopsy|mri results?|ct scan)\b/i,
];

/** Titles that mark a private one-to-one conversation belonging (partly) to someone else. */
const DM_TITLE = /(^|[\s·|—-])(dm|direct message|private message)([\s·|—-]|$)|^\(?\d+\)?\s*(dm|direct)\b/i;
const DM_APPS = /^(whatsapp|signal|telegram|imessage|messages|facetime|wechat|line)$/i;

export type ClassifyInput = { text: string; app?: string | null; windowTitle?: string | null; chat?: boolean };

export function classifySensitivity(input: ClassifyInput): Sensitivity {
  const text = input.text ?? "";
  const title = input.windowTitle ?? "";
  const blob = `${title}\n${text}`;
  if (CREDENTIAL.some((re) => re.test(blob))) return "credential";
  if (FINANCIAL.some((re) => re.test(blob))) return "financial";
  if (HEALTH.some((re) => re.test(blob))) return "health";
  if (input.chat && (DM_TITLE.test(title) || DM_APPS.test((input.app ?? "").trim()))) return "third_party_private";
  return "none";
}
