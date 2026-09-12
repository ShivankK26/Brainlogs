import type { ReactNode } from "react";
import { PAGE_TITLE, useStore } from "../state/store";

export function Header({ right }: { right?: ReactNode }) {
  const { page } = useStore();
  return (
    <div className="hdr" id="hdr">
      <span className="crumb">Brainlog</span><span className="sep">/</span><span>{PAGE_TITLE[page]}</span>
      <span className="right">{right}</span>
    </div>
  );
}
