import { useEffect, useState } from "react";

export type Async<T> = { data: T | null; error: string | null; loading: boolean };

/** Minimal data hook: refetches when `deps` change; keeps the previous data while loading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, set] = useState<Async<T>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    set((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && set({ data, error: null, loading: false }),
      (e: unknown) => alive && set((s) => ({ data: s.data, error: e instanceof Error ? e.message : String(e), loading: false })),
    );
    return () => {
      alive = false;
    };
  }, deps);
  return state;
}
