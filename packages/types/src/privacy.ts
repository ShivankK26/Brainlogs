/**
 * When a surface that floats over other apps must stay quiet (ADR 0015).
 *
 * The recall strip is a private note to one person. The moment the screen stops being private —
 * a shared window, a presentation, a full-screen video in a meeting room — it has to disappear,
 * because the person reading it is no longer the only person seeing it.
 */

/** Phrases the call apps write into a window title while the screen is being shared. */
export const SHARING_TITLE =
  /\b(is sharing|are sharing|sharing your screen|screen sharing|screen share|stop share|stop sharing|presenting to|you're presenting|slideshow|presenter view)\b/i;

export type FrontWindowLike = { title: string; fullscreen?: boolean };

/**
 * True when nothing should be drawn over this window. Fails open: an unknown state is treated as
 * private, because a strip that never appears is a product that does not work.
 */
export function screenIsShared(front: FrontWindowLike): boolean {
  return Boolean(front.fullscreen) || SHARING_TITLE.test(front.title || "");
}
