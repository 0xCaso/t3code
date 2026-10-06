import type { KeybindingCommand } from "@t3tools/contracts";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { setPaneActivatedByKeyboard } from "./paneInteractive";
import { activatePane, closePane, focusNeighbor, paneByOrdinal } from "./splitLayout";
import { useSplitLayoutStore, type OpenRouteIn } from "./splitLayoutStore";

/**
 * Runs `startThread` with the next route opening as a new tab, or in a new column to the right,
 * instead of replacing the active one. Shared by the shortcuts, the palette, the tab bar's + and
 * the header's split button.
 */
export function startThreadInSplit(
  startThread: () => Promise<unknown>,
  where: OpenRouteIn = "tab",
): void {
  const { setOpenRouteIn } = useSplitLayoutStore.getState();
  setOpenRouteIn(where);
  void startThread()
    .catch((error: unknown) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not create thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    })
    .finally(() => setOpenRouteIn(null));
}

/** Handles a `splitView.*` keybinding command against the current layout. */
export function runSplitViewCommand(
  command: KeybindingCommand,
  actions: { startThread: (where: OpenRouteIn) => void },
): void {
  const before = useSplitLayoutStore.getState().layout?.activePaneId;
  applySplitViewCommand(command, actions);
  const after = useSplitLayoutStore.getState().layout?.activePaneId;
  if (after !== undefined && after !== before) setPaneActivatedByKeyboard(true);
}

function applySplitViewCommand(
  command: KeybindingCommand,
  actions: { startThread: (where: OpenRouteIn) => void },
): void {
  const { update, visibleColumnCount } = useSplitLayoutStore.getState();
  switch (command) {
    case "splitView.newTab":
      actions.startThread("tab");
      return;
    case "splitView.newColumn":
      actions.startThread("column");
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
