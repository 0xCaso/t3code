import { createContext, use } from "react";

/**
 * False inside a split pane that is not the active one. Window-level shortcuts, paste
 * capture, autofocus and the app-wide composer handle belong to the active pane only.
 */
export const PaneInteractiveContext = createContext(true);

export function usePaneInteractive(): boolean {
  return use(PaneInteractiveContext);
}
