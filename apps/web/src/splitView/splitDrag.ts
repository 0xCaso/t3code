import { useSyncExternalStore } from "react";

import {
  resolveDropPreview,
  resolvePaneZone,
  tabInsertIndex,
  type DragSource,
  type DropPreview,
  type Rect,
} from "./splitDropZones";
import { useSplitLayoutStore } from "./splitLayoutStore";

/**
 * Pointer-driven drag state for split view drops. Lives in a module variable, not in React
 * state above the overlay, so pointer moves only re-render `SplitDropOverlay`, never the grid.
 */
export interface SplitDragState {
  readonly source: DragSource;
  readonly title: string;
  readonly point: { readonly x: number; readonly y: number };
  readonly paneId: string | null;
  readonly preview: DropPreview | null;
  /** Viewport rect the overlay paints, already narrowed to the zone. */
  readonly highlight: Rect | null;
}

let state: SplitDragState | null = null;
const listeners = new Set<() => void>();

function publish(next: SplitDragState | null) {
  state = next;
  for (const listener of listeners) listener();
}

export function useSplitDrag(): SplitDragState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => null,
  );
}

export function beginSplitDrag(source: DragSource, title: string, point: { x: number; y: number }) {
  publish({ source, title, point, paneId: null, preview: null, highlight: null });
}

function toRect(rect: DOMRect): Rect {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function highlightFor(pane: Rect, tabBar: Rect | null, preview: DropPreview | null): Rect | null {
  if (!preview || preview.kind === "context" || preview.kind === "none") return null;
  if (preview.kind === "reject") return pane;
  const width = pane.right - pane.left;
  const height = pane.bottom - pane.top;
  switch (preview.highlight) {
    case "pane":
      return pane;
    case "tabs":
      return tabBar ?? pane;
    case "left":
      return { ...pane, right: pane.left + width / 2 };
    case "right":
      return { ...pane, left: pane.right - width / 2 };
    case "top":
      return { ...pane, bottom: pane.top + height / 2 };
    case "bottom":
      return { ...pane, top: pane.bottom - height / 2 };
  }
}

export function moveSplitDrag(point: { x: number; y: number }): DropPreview | null {
  if (!state) return null;
  const paneElement = document
    .elementFromPoint(point.x, point.y)
    ?.closest<HTMLElement>("[data-split-pane]");
  const { layout, maxColumns } = useSplitLayoutStore.getState();
  if (!paneElement || !layout) {
    publish({ ...state, point, paneId: null, preview: null, highlight: null });
    return null;
  }
  const paneId = paneElement.dataset.splitPane ?? "";
  const pane = toRect(paneElement.getBoundingClientRect());
  const tabBarElement = paneElement.querySelector<HTMLElement>("[data-split-tabbar]");
  const tabBar = tabBarElement ? toRect(tabBarElement.getBoundingClientRect()) : null;
  const composerElement = paneElement.querySelector<HTMLElement>("[data-thread-context-drop]");
  const zone = resolvePaneZone({
    pane,
    tabBarBottom: tabBar?.bottom ?? pane.top,
    composer: composerElement ? toRect(composerElement.getBoundingClientRect()) : null,
    point,
  });
  const tabs = [...paneElement.querySelectorAll<HTMLElement>("[data-split-tab]")].map((tab) =>
    toRect(tab.getBoundingClientRect()),
  );
  const preview = zone
    ? resolveDropPreview({
        layout,
        paneId,
        zone,
        tabIndex: tabInsertIndex(tabs, point.x),
        maxColumns,
        source: state.source,
      })
    : null;
  publish({ ...state, point, paneId, preview, highlight: highlightFor(pane, tabBar, preview) });
  return preview;
}

/** Clears the drag and returns the last target; callers act only on an `accept` preview. */
export function endSplitDrag(): { paneId: string; preview: DropPreview } | null {
  const last = state;
  publish(null);
  return last?.paneId && last.preview ? { paneId: last.paneId, preview: last.preview } : null;
}
