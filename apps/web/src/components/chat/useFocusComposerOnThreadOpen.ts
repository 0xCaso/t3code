import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { restoreFocusOnThreadEnter } from "../../lib/terminalFocus";
import { takePaneActivatedByKeyboard } from "../../splitView/paneInteractive";

/** Restores thread focus, landing the caret a frame after composer entry or split pane activation. */
export function useFocusComposerOnThreadOpen(
  threadRef: ScopedThreadRef | null,
  root: HTMLElement | null,
  enabled: boolean,
  terminalOpen: boolean,
  focusComposer: () => void,
  interactive = true,
) {
  const seenRef = useRef({ interactive, threadRef });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- restores DOM focus on thread entry, split pane activation, and after the drawer opens or closes
  useEffect(() => {
    const seen = seenRef.current;
    seenRef.current = { interactive, threadRef };
    if (!threadRef || !enabled || !root || !interactive) return;
    // A pane activated by a click keeps the focus the click gave it (an input, a text
    // selection); a split view shortcut hands focus to the composer.
    const keepClickFocus =
      !seen.interactive &&
      !takePaneActivatedByKeyboard() &&
      seen.threadRef?.environmentId === threadRef.environmentId &&
      seen.threadRef.threadId === threadRef.threadId;
    let frame: number | undefined;
    const leave = restoreFocusOnThreadEnter(threadRef, {
      root,
      focusComposer: () => {
        if (keepClickFocus) return;
        frame = window.requestAnimationFrame(() => {
          // Double-clicking a sidebar row opens its thread and its rename field in one gesture.
          if (document.activeElement?.matches("[data-sidebar-row] input")) return;
          focusComposer();
        });
      },
    });
    return () => {
      leave();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [
    threadRef,
    root,
    enabled,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Drawer visibility changes also restore focus after explicit open/close actions.
    terminalOpen,
    focusComposer,
    interactive,
  ]);
}
