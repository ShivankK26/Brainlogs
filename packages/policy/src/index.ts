export { isBlocked, isBlockedApp, isBlockedDomain, type Surface } from "./blocklist.js";
export { classifySensitivity, type ClassifyInput } from "./sensitivity.js";
export { captureGate, type CaptureGateDecision, type CaptureGateInput } from "./capture-gate.js";
export { gate, finishAudit, resolvePermissions, PolicyDeniedError, type GateRequest, type GateResult, type Permission } from "./gate.js";
