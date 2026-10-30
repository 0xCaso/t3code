import {
  MAX_COLUMNS,
  MAX_PANES_PER_COLUMN,
  MAX_TABS_PER_PANE,
  findPane,
  type DropTarget,
  type EdgeSide,
  type SplitLayout,
} from "./splitLayout";

/** Share of the pane body each edge zone takes (stima, tune by feel). */
const EDGE_ZONE_FRACTION = 0.22;

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type PaneZone =
  | { readonly kind: "tabs" }
  | { readonly kind: "composer" }
  | { readonly kind: "replace" }
  | { readonly kind: "edge"; readonly side: EdgeSide };

export type DragSource =
  | { readonly kind: "sidebar" }
  | { readonly kind: "tab"; readonly paneId: string; readonly index: number };

export type DropPreview =
  | {
      readonly kind: "accept";
      readonly target: DropTarget;
      readonly label: "Open here" | "New column" | "New row" | "New tab";
      readonly highlight: "pane" | "tabs" | EdgeSide;
    }
  | { readonly kind: "reject"; readonly label: "Tab limit reached" }
  /** A sidebar thread over a composer: the existing "add as context" drop takes it. */
  | { readonly kind: "context" }
  /** No overlay; the drop does nothing. */
  | { readonly kind: "none" };

function contains(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

export function resolvePaneZone(input: {
  readonly pane: Rect;
  readonly tabBarBottom: number;
  readonly composer: Rect | null;
  readonly point: { readonly x: number; readonly y: number };
}): PaneZone | null {
  const { pane, point, composer, tabBarBottom } = input;
  if (!contains(pane, point)) return null;
  if (point.y < tabBarBottom) return { kind: "tabs" };
  if (composer && contains(composer, point)) return { kind: "composer" };
  const bodyBottom = composer?.top ?? pane.bottom;
  const width = pane.right - pane.left;
  const height = bodyBottom - tabBarBottom;
  if (point.x < pane.left + width * EDGE_ZONE_FRACTION) return { kind: "edge", side: "left" };
  if (point.x > pane.right - width * EDGE_ZONE_FRACTION) return { kind: "edge", side: "right" };
  if (point.y < tabBarBottom + height * EDGE_ZONE_FRACTION) return { kind: "edge", side: "top" };
  if (point.y > bodyBottom - height * EDGE_ZONE_FRACTION) return { kind: "edge", side: "bottom" };
  return { kind: "replace" };
}

export function tabInsertIndex(tabs: ReadonlyArray<Rect>, x: number): number {
  const index = tabs.findIndex((tab) => x < (tab.left + tab.right) / 2);
  return index === -1 ? tabs.length : index;
}

export function resolveDropPreview(input: {
  readonly layout: SplitLayout;
  readonly paneId: string;
  readonly zone: PaneZone;
  readonly tabIndex: number;
  readonly maxColumns: number;
  readonly source: DragSource;
}): DropPreview {
  const { layout, paneId, source } = input;
  const position = findPane(layout, paneId);
  if (!position) return { kind: "reject", label: "Tab limit reached" };
  const zone: PaneZone =
    input.zone.kind === "composer"
      ? source.kind === "sidebar"
        ? input.zone
        : { kind: "edge", side: "bottom" }
      : input.zone;
  if (zone.kind === "composer") return { kind: "context" };

  const asTab = (): DropPreview => {
    const reordering = source.kind === "tab" && source.paneId === paneId;
    if (!reordering && position.pane.tabs.length >= MAX_TABS_PER_PANE) {
      return { kind: "reject", label: "Tab limit reached" };
    }
    return {
      kind: "accept",
      target: { kind: "tab", paneId, index: input.tabIndex },
      label: "New tab",
      highlight: "tabs",
    };
  };

  switch (zone.kind) {
    case "tabs":
      return asTab();
    case "replace": {
      // Dragging a tab onto its own pane's body is a no-op: prevents data loss.
      if (source.kind === "tab" && source.paneId === paneId) {
        return { kind: "none" };
      }
      return {
        kind: "accept",
        target: { kind: "replace", paneId },
        label: "Open here",
        highlight: "pane",
      };
    }
    case "edge": {
      // Moving a lone tab to an edge of its own pane is a no-op.
      if (source.kind === "tab" && source.paneId === paneId && position.pane.tabs.length === 1) {
        return { kind: "none" };
      }
      const horizontal = zone.side === "left" || zone.side === "right";
      const column = layout.columns[position.columnIndex];
      const full = horizontal
        ? layout.columns.length >= Math.min(input.maxColumns, MAX_COLUMNS)
        : (column?.panes.length ?? 0) >= MAX_PANES_PER_COLUMN;
      if (full) return asTab();
      return {
        kind: "accept",
        target: { kind: "edge", paneId, side: zone.side },
        label: horizontal ? "New column" : "New row",
        highlight: zone.side,
      };
    }
  }
}
