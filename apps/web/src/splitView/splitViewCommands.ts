import type { KeybindingCommand } from "@t3tools/contracts";

import { activatePane, closePane, focusNeighbor, paneByOrdinal } from "./splitLayout";
import { useSplitLayoutStore } from "./splitLayoutStore";

/**
 * Runs `startThread` with the next route opening as a new tab instead of
 * replacing the active one. Shared by the new-tab shortcut and the palette.
 */
export function startThreadInNewTab(startThread: () => Promise<unknown>): void {
  const { setOpenRouteInNewTab } = useSplitLayoutStore.getState();
  setOpenRouteInNewTab(true);
  void startThread().finally(() => setOpenRouteInNewTab(false));
}

/** Handles a `splitView.*` keybinding command against the current layout. */
export function runSplitViewCommand(
  command: KeybindingCommand,
  actions: { startNewTab: () => void },
): void {
  const { update, visibleColumnCount } = useSplitLayoutStore.getState();
  switch (command) {
    case "splitView.newTab":
      actions.startNewTab();
      return;
    case "splitView.closePane":
      update((layout) => closePane(layout, layout.activePaneId));
      return;
    case "splitView.focusLeft":
      update((layout) => focusNeighbor(layout, "left", visibleColumnCount));
      return;
    case "splitView.focusRight":
      update((layout) => focusNeighbor(layout, "right", visibleColumnCount));
      return;
    case "splitView.focusUp":
      update((layout) => focusNeighbor(layout, "up", visibleColumnCount));
      return;
    case "splitView.focusDown":
      update((layout) => focusNeighbor(layout, "down", visibleColumnCount));
      return;
  }
  const ordinal = /^splitView\.focusPane\.(\d)$/.exec(command)?.[1];
  if (ordinal === undefined) return;
  update((layout) => {
    const paneId = paneByOrdinal(layout, Number(ordinal), visibleColumnCount);
    return paneId ? activatePane(layout, paneId) : layout;
  });
}
