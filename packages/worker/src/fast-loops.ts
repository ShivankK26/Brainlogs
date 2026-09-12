import { runJob, log } from "@brainlog/core";
import { ingestSpool, ingestSpoolLegacy } from "@brainlog/capture";
import { detectOpenLoops } from "@brainlog/agents";

let fastLoopsTimer: ReturnType<typeof setTimeout> | null = null;
let fastLoopsRunning = false;

/** Debounced OCR → open-loop detect (seconds, not 30 min). */
export function scheduleFastLoopDetect(reason = "capture") {
  if (fastLoopsTimer) clearTimeout(fastLoopsTimer);
  fastLoopsTimer = setTimeout(() => {
    fastLoopsTimer = null;
    void runFastLoopDetect(reason);
  }, 4_000);
}

async function runFastLoopDetect(reason: string) {
  if (fastLoopsRunning) {
    scheduleFastLoopDetect(reason);
    return;
  }
  fastLoopsRunning = true;
  try {
    await runJob("loops:fast", async () => {
      const r = await detectOpenLoops({ mode: "fast" });
      return { stats: { ...r, reason } as unknown as Record<string, unknown> };
    });
  } catch (e) {
    log.error("fast loop detect failed", { err: String(e), reason });
  } finally {
    fastLoopsRunning = false;
  }
}

/** Ingest spool immediately + schedule fast loop detect (desktop OCR wake). */
export async function wakeFromCapture(): Promise<{
  inserted: number;
  scheduled: boolean;
}> {
  await ingestSpool();
  const r = await ingestSpoolLegacy();
  if ((r.inserted ?? 0) > 0) {
    scheduleFastLoopDetect("wake");
  }
  return { inserted: r.inserted ?? 0, scheduled: (r.inserted ?? 0) > 0 };
}
