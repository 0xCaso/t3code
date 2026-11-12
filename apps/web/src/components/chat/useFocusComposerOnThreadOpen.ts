import { useEffect, useRef } from "react";

import { takePaneActivatedByKeyboard } from "../../splitView/paneInteractive";

/** Lands the caret in the composer a frame after a thread opens or its split pane becomes active. */
export function useFocusComposerOnThreadOpen(
  threadId: string | undefined,
  enabled: boolean,
  focusComposer: () => void,
  interactive = true,
) {
  const seenRef = useRef({ interactive, threadId });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- schedules a frame to focus the composer DOM element when a thread opens or its pane becomes active
  useEffect(() => {
    const seen = seenRef.current;
    seenRef.current = { interactive, threadId };
    if (!interactive) return;
    // A pane activated by a click keeps the focus the click gave it (an input, a text
    // selection); a split view shortcut hands focus to the composer.
    if (!seen.interactive && !takePaneActivatedByKeyboard() && seen.threadId === threadId) return;
    if (!threadId || !enabled) return;
    const frame = window.requestAnimationFrame(() => {
      // Double-clicking a sidebar row opens its thread and its rename field in one gesture.
      if (document.activeElement?.matches("[data-sidebar-row] input")) return;
      focusComposer();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [threadId, enabled, focusComposer, interactive]);
}
