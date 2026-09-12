import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";

export type Page = "overview" | "memory" | "commitments" | "agents" | "audit" | "privacy";
export const PAGE_TITLE: Record<Page, string> = { overview: "Pulse", memory: "Memory", commitments: "Commitments", agents: "Agents", audit: "Audit log", privacy: "Data & retention" };

/** A memory filter is either free text (search) or an explicit set of event ids (evidence for a narrative sentence). */
export type Filter = { kind: "text"; q: string } | { kind: "ids"; ids: string[]; label: string } | null;

type State = { page: Page; filter: Filter; selected: string | null; paletteOpen: boolean; toast: string | null; reviewOpen: boolean; version: number; userInitials: string };
type Action =
  | { type: "go"; page: Page }
  | { type: "filter"; filter: Filter }
  | { type: "select"; id: string | null }
  | { type: "palette"; open: boolean }
  | { type: "toast"; text: string | null }
  | { type: "review"; open: boolean }
  | { type: "bump" }
  | { type: "user"; initials: string };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "go":
      return { ...s, page: a.page, paletteOpen: false };
    case "filter":
      return { ...s, filter: a.filter, selected: null };
    case "select":
      return { ...s, selected: a.id };
    case "palette":
      return { ...s, paletteOpen: a.open };
    case "toast":
      return { ...s, toast: a.text };
    case "review":
      return { ...s, reviewOpen: a.open };
    case "bump":
      return { ...s, version: s.version + 1 };
    case "user":
      return s.userInitials === a.initials ? s : { ...s, userInitials: a.initials };
  }
}

const initial: State = { page: "overview", filter: null, selected: null, paletteOpen: false, toast: null, reviewOpen: false, version: 0, userInitials: "" };

type Store = State & {
  go: (page: Page) => void;
  setFilter: (f: Filter) => void;
  select: (id: string | null) => void;
  openPalette: () => void;
  closePalette: () => void;
  toastMsg: (text: string) => void;
  setReview: (open: boolean) => void;
  /** Invalidate cached data after a write. */
  bump: () => void;
  setUser: (initials: string) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const toastMsg = useCallback((text: string) => {
    dispatch({ type: "toast", text });
    window.setTimeout(() => dispatch({ type: "toast", text: null }), 1800);
  }, []);
  // Actions only depend on the (stable) dispatch, so their identities never change and effects that list them do not re-run.
  const actions = useMemo(
    () => ({
      go: (page: Page) => dispatch({ type: "go", page }),
      setFilter: (filter: Filter) => dispatch({ type: "filter", filter }),
      select: (id: string | null) => dispatch({ type: "select", id }),
      openPalette: () => dispatch({ type: "palette", open: true }),
      closePalette: () => dispatch({ type: "palette", open: false }),
      toastMsg,
      setReview: (open: boolean) => dispatch({ type: "review", open }),
      bump: () => dispatch({ type: "bump" }),
      setUser: (initials: string) => dispatch({ type: "user", initials }),
    }),
    [toastMsg],
  );
  const value = useMemo<Store>(() => ({ ...state, ...actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
