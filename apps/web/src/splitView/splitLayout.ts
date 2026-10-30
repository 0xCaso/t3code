import { scopedThreadKey } from "@t3tools/client-runtime/environment";

import { randomUUID } from "../lib/utils";
import type { ThreadRouteTarget } from "../threadRoutes";

export const MAX_COLUMNS = 4;
export const MAX_PANES_PER_COLUMN = 2;
export const MAX_TABS_PER_PANE = 4;

/** A tab shows a server thread or an unsent draft, exactly like the two thread routes. */
export type PaneTab = ThreadRouteTarget;

export interface SplitPane {
  readonly id: string;
  readonly tabs: ReadonlyArray<PaneTab>;
  readonly activeTabIndex: number;
}

export interface SplitColumn {
  readonly id: string;
  readonly panes: ReadonlyArray<SplitPane>;
  /** Share of the grid width. The shares of all columns sum to 1. */
  readonly width: number;
}

export interface SplitLayout {
  readonly columns: ReadonlyArray<SplitColumn>;
  readonly activePaneId: string;
}

export type EdgeSide = "left" | "right" | "top" | "bottom";
export type FocusDirection = "left" | "right" | "up" | "down";

export type DropTarget =
  | { readonly kind: "replace"; readonly paneId: string }
  | { readonly kind: "tab"; readonly paneId: string; readonly index: number }
  | { readonly kind: "edge"; readonly paneId: string; readonly side: EdgeSide };

interface PanePosition {
  readonly columnIndex: number;
  readonly paneIndex: number;
  readonly pane: SplitPane;
}

function makeSplitId(prefix: "column" | "pane"): string {
  return `${prefix}-${randomUUID()}`;
}

export function paneTabKey(tab: PaneTab): string {
  return tab.kind === "server" ? scopedThreadKey(tab.threadRef) : `draft:${tab.draftId}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function newPane(tabs: ReadonlyArray<PaneTab>): SplitPane {
  return { id: makeSplitId("pane"), tabs, activeTabIndex: 0 };
}

function newColumn(pane: SplitPane, width: number): SplitColumn {
  return { id: makeSplitId("column"), panes: [pane], width };
}

function equalizeWidths(columns: ReadonlyArray<SplitColumn>): ReadonlyArray<SplitColumn> {
  return columns.map((column) => ({ ...column, width: 1 / columns.length }));
}

export function createLayout(tab: PaneTab): SplitLayout {
  const pane = newPane([tab]);
  return { columns: [newColumn(pane, 1)], activePaneId: pane.id };
}

export function allPanes(layout: SplitLayout): ReadonlyArray<SplitPane> {
  return layout.columns.flatMap((column) => column.panes);
}

/** Tab bars and the active border appear once there is a second pane or a second tab. */
export function hasPaneChrome(layout: SplitLayout): boolean {
  const panes = allPanes(layout);
  return panes.length > 1 || panes.some((pane) => pane.tabs.length > 1);
}

export function findPane(layout: SplitLayout, paneId: string): PanePosition | null {
  for (const [columnIndex, column] of layout.columns.entries()) {
    for (const [paneIndex, pane] of column.panes.entries()) {
      if (pane.id === paneId) return { columnIndex, paneIndex, pane };
    }
  }
  return null;
}

function activePane(layout: SplitLayout): SplitPane {
  const pane = findPane(layout, layout.activePaneId)?.pane ?? allPanes(layout)[0];
  if (!pane) throw new Error("A split layout always has a pane.");
  return pane;
}

export function paneActiveTab(pane: SplitPane): PaneTab {
  const tab = pane.tabs[pane.activeTabIndex] ?? pane.tabs[0];
  if (!tab) throw new Error("A split pane always has a tab.");
  return tab;
}

export function activeTab(layout: SplitLayout): PaneTab {
  return paneActiveTab(activePane(layout));
}

export function locateTab(
  layout: SplitLayout,
  key: string,
): { readonly paneId: string; readonly index: number } | null {
  for (const pane of allPanes(layout)) {
    const index = pane.tabs.findIndex((tab) => paneTabKey(tab) === key);
    if (index !== -1) return { paneId: pane.id, index };
  }
  return null;
}

function mapPane(
  layout: SplitLayout,
  paneId: string,
  update: (pane: SplitPane) => SplitPane,
): SplitLayout {
  return {
    ...layout,
    columns: layout.columns.map((column) =>
      column.panes.some((pane) => pane.id === paneId)
        ? {
            ...column,
            panes: column.panes.map((pane) => (pane.id === paneId ? update(pane) : pane)),
          }
        : column,
    ),
  };
}

export function activatePane(layout: SplitLayout, paneId: string): SplitLayout {
  if (layout.activePaneId === paneId || !findPane(layout, paneId)) return layout;
  return { ...layout, activePaneId: paneId };
}

export function activateTab(layout: SplitLayout, paneId: string, index: number): SplitLayout {
  const position = findPane(layout, paneId);
  if (!position || index < 0 || index >= position.pane.tabs.length) return layout;
  if (layout.activePaneId === paneId && position.pane.activeTabIndex === index) return layout;
  return {
    ...mapPane(layout, paneId, (pane) => ({ ...pane, activeTabIndex: index })),
    activePaneId: paneId,
  };
}

/** "Open here": the pane's active tab shows `tab` instead. */
function replaceActiveTab(layout: SplitLayout, paneId: string, tab: PaneTab): SplitLayout {
  const existing = locateTab(layout, paneTabKey(tab));
  if (existing) return activateTab(layout, existing.paneId, existing.index);
  if (!findPane(layout, paneId)) return layout;
  return {
    ...mapPane(layout, paneId, (pane) => ({
      ...pane,
      tabs: pane.tabs.map((candidate, index) => (index === pane.activeTabIndex ? tab : candidate)),
    })),
    activePaneId: paneId,
  };
}

/** Where a route change lands: an open thread gets focus, anything else fills the active pane. */
export function showTarget(
  layout: SplitLayout,
  tab: PaneTab,
  mode: "replace" | "new-tab" | "new-column",
  maxColumns = MAX_COLUMNS,
): SplitLayout {
  const existing = locateTab(layout, paneTabKey(tab));
  if (existing) return activateTab(layout, existing.paneId, existing.index);
  const paneId = activePane(layout).id;
  if (mode !== "replace") {
    const opened =
      mode === "new-tab"
        ? openTab(layout, paneId, tab)
        : openBeside(layout, paneId, "right", tab, maxColumns);
    if (opened) return opened;
  }
  return replaceActiveTab(layout, paneId, tab);
}

/** Adds a focused tab to a pane. Null when the pane is full or unknown. */
export function openTab(
  layout: SplitLayout,
  paneId: string,
  tab: PaneTab,
  index?: number,
): SplitLayout | null {
  const existing = locateTab(layout, paneTabKey(tab));
  if (existing) return activateTab(layout, existing.paneId, existing.index);
  const position = findPane(layout, paneId);
  if (!position || position.pane.tabs.length >= MAX_TABS_PER_PANE) return null;
  const at = clamp(index ?? position.pane.tabs.length, 0, position.pane.tabs.length);
  const tabs = [...position.pane.tabs.slice(0, at), tab, ...position.pane.tabs.slice(at)];
  return {
    ...mapPane(layout, paneId, (pane) => ({ ...pane, tabs, activeTabIndex: at })),
    activePaneId: paneId,
  };
}

/**
 * Opens `tab` in a new column (left/right) or row (top/bottom) next to a pane.
 * At the column or row limit it becomes a tab of that pane; null when that pane is full too.
 */
export function openBeside(
  layout: SplitLayout,
  paneId: string,
  side: EdgeSide,
  tab: PaneTab,
  maxColumns: number,
): SplitLayout | null {
  const existing = locateTab(layout, paneTabKey(tab));
  if (existing) return activateTab(layout, existing.paneId, existing.index);
  const position = findPane(layout, paneId);
  if (!position) return null;
  const pane = newPane([tab]);
  if (side === "left" || side === "right") {
    if (layout.columns.length >= Math.min(maxColumns, MAX_COLUMNS)) {
      return openTab(layout, paneId, tab);
    }
    const at = position.columnIndex + (side === "right" ? 1 : 0);
    const columns = [
      ...layout.columns.slice(0, at),
      newColumn(pane, 0),
      ...layout.columns.slice(at),
    ];
    return { columns: equalizeWidths(columns), activePaneId: pane.id };
  }
  const column = layout.columns[position.columnIndex];
  if (!column || column.panes.length >= MAX_PANES_PER_COLUMN) {
    return openTab(layout, paneId, tab);
  }
  const at = position.paneIndex + (side === "bottom" ? 1 : 0);
  const panes = [...column.panes.slice(0, at), pane, ...column.panes.slice(at)];
  return {
    columns: layout.columns.map((candidate, index) =>
      index === position.columnIndex ? { ...candidate, panes } : candidate,
    ),
    activePaneId: pane.id,
  };
}

export function applyDrop(
  layout: SplitLayout,
  target: DropTarget,
  tab: PaneTab,
  maxColumns: number,
): SplitLayout | null {
  switch (target.kind) {
    case "replace":
      return replaceActiveTab(layout, target.paneId, tab);
    case "tab":
      return openTab(layout, target.paneId, tab, target.index);
    case "edge":
      return openBeside(layout, target.paneId, target.side, tab, maxColumns);
  }
}

/** Null when the pane is the last one: a layout is never empty. */
export function closePane(layout: SplitLayout, paneId: string): SplitLayout | null {
  const position = findPane(layout, paneId);
  if (!position) return layout;
  if (allPanes(layout).length === 1) return null;
  const column = layout.columns[position.columnIndex];
  const remainingPanes = (column?.panes ?? []).filter((pane) => pane.id !== paneId);
  const columns =
    remainingPanes.length === 0
      ? equalizeWidths(layout.columns.filter((_, index) => index !== position.columnIndex))
      : layout.columns.map((candidate, index) =>
          index === position.columnIndex ? { ...candidate, panes: remainingPanes } : candidate,
        );
  if (layout.activePaneId !== paneId) return { columns, activePaneId: layout.activePaneId };
  const neighbour =
    remainingPanes[Math.max(0, position.paneIndex - 1)] ??
    columns[Math.max(0, position.columnIndex - 1)]?.panes[0] ??
    columns.flatMap((candidate) => candidate.panes)[0];
  if (!neighbour) return null;
  return { columns, activePaneId: neighbour.id };
}

/** Null when it was the last tab of the last pane. */
export function closeTab(layout: SplitLayout, paneId: string, index: number): SplitLayout | null {
  const position = findPane(layout, paneId);
  if (!position || index < 0 || index >= position.pane.tabs.length) return layout;
  if (position.pane.tabs.length === 1) return closePane(layout, paneId);
  const tabs = position.pane.tabs.filter((_, candidate) => candidate !== index);
  const active = position.pane.activeTabIndex;
  const activeTabIndex = index < active ? active - 1 : Math.min(active, tabs.length - 1);
  return mapPane(layout, paneId, (pane) => ({ ...pane, tabs, activeTabIndex }));
}

/** Closes every tab showing this thread or draft. Null when nothing would be left. */
export function closeThread(layout: SplitLayout, key: string): SplitLayout | null {
  let next: SplitLayout | null = layout;
  while (next !== null) {
    const found = locateTab(next, key);
    if (!found) return next;
    next = closeTab(next, found.paneId, found.index);
  }
  return null;
}

/** Points the tab showing `fromKey` at `to`, as when a draft becomes a server thread. */
export function retargetTab(layout: SplitLayout, fromKey: string, to: PaneTab): SplitLayout {
  const found = locateTab(layout, fromKey);
  if (!found) return layout;
  if (locateTab(layout, paneTabKey(to))) {
    return closeTab(layout, found.paneId, found.index) ?? layout;
  }
  return mapPane(layout, found.paneId, (pane) => ({
    ...pane,
    tabs: pane.tabs.map((tab, index) => (index === found.index ? to : tab)),
  }));
}

/** Moves a tab to a drop target. Unchanged when the drop has nowhere to go. */
export function moveTab(
  layout: SplitLayout,
  from: { readonly paneId: string; readonly index: number },
  target: DropTarget,
  maxColumns: number,
): SplitLayout {
  const source = findPane(layout, from.paneId);
  const tab = source?.pane.tabs[from.index];
  if (!source || !tab) return layout;
  if (target.kind === "tab" && target.paneId === from.paneId) {
    const tabs = source.pane.tabs.filter((_, index) => index !== from.index);
    const at = clamp(target.index > from.index ? target.index - 1 : target.index, 0, tabs.length);
    tabs.splice(at, 0, tab);
    return {
      ...mapPane(layout, from.paneId, (pane) => ({ ...pane, tabs, activeTabIndex: at })),
      activePaneId: from.paneId,
    };
  }
  if (target.kind === "replace" && target.paneId === from.paneId) return layout;
  if (target.paneId === from.paneId && source.pane.tabs.length === 1) return layout;
  const without = closeTab(layout, from.paneId, from.index);
  if (!without || !findPane(without, target.paneId)) return layout;
  return applyDrop(without, target, tab, maxColumns) ?? layout;
}

export function focusNeighbor(
  layout: SplitLayout,
  direction: FocusDirection,
  visibleColumnCount: number,
): SplitLayout {
  const position = findPane(layout, layout.activePaneId);
  if (!position) return layout;
  const columnIndex =
    position.columnIndex + (direction === "left" ? -1 : direction === "right" ? 1 : 0);
  if (columnIndex < 0 || columnIndex >= visibleColumnCount) return layout;
  const column = layout.columns[columnIndex];
  if (!column) return layout;
  if (direction === "up" || direction === "down") {
    const target = column.panes[position.paneIndex + (direction === "up" ? -1 : 1)];
    return target ? activatePane(layout, target.id) : layout;
  }
  const target = column.panes[Math.min(position.paneIndex, column.panes.length - 1)];
  return target ? activatePane(layout, target.id) : layout;
}

/** Pane N (1-based) in reading order among visible columns: left to right, then top to bottom. */
export function paneByOrdinal(
  layout: SplitLayout,
  ordinal: number,
  visibleColumnCount: number,
): string | null {
  return (
    layout.columns.slice(0, visibleColumnCount).flatMap((column) => column.panes)[ordinal - 1]
      ?.id ?? null
  );
}

/** Keys of the threads currently on screen: each visible pane's active tab. */
export function visibleTabKeys(
  layout: SplitLayout,
  visibleColumnCount: number,
): ReadonlySet<string> {
  return new Set(
    layout.columns
      .slice(0, visibleColumnCount)
      .flatMap((column) => column.panes)
      .map((pane) => paneTabKey(paneActiveTab(pane))),
  );
}
