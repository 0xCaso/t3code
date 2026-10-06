import { createContext, use } from "react";

/**
 * False inside a split pane that is not the active one. Window-level shortcuts, paste
 * capture, autofocus and the app-wide composer handle belong to the active pane only.
 */
export const PaneInteractiveContext = createContext(true);

export function usePaneInteractive(): boolean {
  return use(PaneInteractiveContext);
}

let activatedByKeyboard = false;

/**
 * Set when a split view command moves the active pane, so the pane that becomes active
 * focuses its composer. A pointer activation clears it: the click already placed focus.
 */
export function setPaneActivatedByKeyboard(value: boolean): void {
  activatedByKeyboard = value;
}

/** Read once by the pane that just became active. */
export function takePaneActivatedByKeyboard(): boolean {
  const value = activatedByKeyboard;
  activatedByKeyboard = false;
  return value;
}
