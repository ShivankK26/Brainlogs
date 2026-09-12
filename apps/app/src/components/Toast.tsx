import { useStore } from "../state/store";
export function Toast() {
  const { toast } = useStore();
  return <div className="toast" id="toast" data-on={toast ? "" : undefined} role="status">{toast}</div>;
}
