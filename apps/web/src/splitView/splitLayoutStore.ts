import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { DraftId } from "../composerDraftStore";
import { resolveStorage } from "../lib/storage";
import { fitColumnOrder } from "./splitGeometry";
import {
  MAX_COLUMNS,
  MAX_PANES_PER_COLUMN,
  MAX_TABS_PER_PANE,
  closeThread,
  locateTab,
  openBeside,
  openTab,
  paneTabKey,
  visibleTabKeys,
  type PaneTab,
  type SplitColumn,
  type SplitLayout,
  type SplitPane,
} from "./splitLayout";

export type OpenRouteIn = "tab" | "column";

interface SplitLayoutState {
  readonly layout: SplitLayout | null;
  /** Column order before the window got too narrow for the active column; see fitColumnOrder. */
  readonly columnOrder: ReadonlyArray<string> | null;
  /** One-shot: the next thread route opens as a new tab of the active pane, or in a new column beside it. */
  readonly openRouteIn: OpenRouteIn | null;
  /** Measured by SplitViewRoot; not persisted. */
  readonly visibleColumnCount: number;
  readonly maxColumns: number;
  setLayout: (layout: SplitLayout) => void;
  update: (fn: (layout: SplitLayout) => SplitLayout | null) => void;
  setOpenRouteIn: (value: OpenRouteIn | null) => void;
  setCapacity: (capacity: { visibleColumnCount: number; maxColumns: number }) => void;
  /** Keeps the active column on screen and restores the order once there is room. */
  fitColumns: (visibleColumnCount: number) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeTab(value: unknown): PaneTab | null {
  if (!isRecord(value)) return null;
  if (value.kind === "draft" && typeof value.draftId === "string" && value.draftId !== "") {
    return { kind: "draft", draftId: value.draftId as DraftId };
  }
  const ref = value.threadRef;
  if (
    value.kind === "server" &&
    isRecord(ref) &&
    typeof ref.environmentId === "string" &&
    typeof ref.threadId === "string"
  ) {
    return {
      kind: "server",
      threadRef: scopeThreadRef(ref.environmentId as EnvironmentId, ref.threadId as ThreadId),
    };
  }
  return null;
}

/** Restores a persisted layout, dropping anything malformed or over the limits. */
export function sanitizeLayout(value: unknown): SplitLayout | null {
  if (!isRecord(value) || !Array.isArray(value.columns)) return null;
  const seen = new Set<string>();
  const columns: SplitColumn[] = [];
  for (const rawColumn of value.columns.slice(0, MAX_COLUMNS)) {
    if (!isRecord(rawColumn) || typeof rawColumn.id !== "string") continue;
    if (!Array.isArray(rawColumn.panes)) continue;
    const panes: SplitPane[] = [];
    for (const rawPane of rawColumn.panes.slice(0, MAX_PANES_PER_COLUMN)) {
      if (!isRecord(rawPane) || typeof rawPane.id !== "string") continue;
      if (!Array.isArray(rawPane.tabs)) continue;
      const tabs: PaneTab[] = [];
      for (const rawTab of rawPane.tabs) {
        const tab = sanitizeTab(rawTab);
        if (!tab || seen.has(paneTabKey(tab)) || tabs.length >= MAX_TABS_PER_PANE) continue;
        seen.add(paneTabKey(tab));
        tabs.push(tab);
      }
      if (tabs.length === 0) continue;
      const rawIndex = typeof rawPane.activeTabIndex === "number" ? rawPane.activeTabIndex : 0;
      const activeTabIndex = Math.min(Math.max(0, Math.trunc(rawIndex)), tabs.length - 1);
      panes.push({ id: rawPane.id, tabs, activeTabIndex });
    }
    if (panes.length === 0) continue;
    const width = typeof rawColumn.width === "number" && rawColumn.width > 0 ? rawColumn.width : 0;
    columns.push({ id: rawColumn.id, panes, width });
  }
  if (columns.length === 0) return null;
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  const normalized = columns.map((column) => ({
    ...column,
    width: total > 0 && column.width > 0 ? column.width / total : 1 / columns.length,
  }));
  const paneIds = normalized.flatMap((column) => column.panes.map((pane) => pane.id));
  const activePaneId =
    typeof value.activePaneId === "string" && paneIds.includes(value.activePaneId)
      ? value.activePaneId
      : paneIds[0];
  if (!activePaneId) return null;
  return { columns: normalized, activePaneId };
}

function sanitizeColumnOrder(value: unknown): ReadonlyArray<string> | null {
  return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : null;
}

export const useSplitLayoutStore = create<SplitLayoutState>()(
  persist(
    (set) => ({
      layout: null,
      columnOrder: null,
      openRouteIn: null,
      visibleColumnCount: 1,
      maxColumns: MAX_COLUMNS,
      setLayout: (layout) => set({ layout }),
      update: (fn) =>
        set((state) => {
          if (!state.layout) return state;
          const next = fn(state.layout);
          return next === null || next === state.layout ? state : { layout: next };
        }),
      setOpenRouteIn: (openRouteIn) => set({ openRouteIn }),
      setCapacity: ({ visibleColumnCount, maxColumns }) =>
        set((state) =>
          state.visibleColumnCount === visibleColumnCount && state.maxColumns === maxColumns
            ? state
            : { visibleColumnCount, maxColumns },
        ),
      fitColumns: (visibleColumnCount) =>
        set((state) => {
          if (!state.layout) return state;
          const next = fitColumnOrder(state.layout, state.columnOrder, visibleColumnCount);
          return next.layout === state.layout && next.order === state.columnOrder
            ? state
            : { layout: next.layout, columnOrder: next.order };
        }),
    }),
    {
      name: "t3code:split-layout:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ layout: state.layout, columnOrder: state.columnOrder }),
      merge: (persisted, current) => ({
        ...current,
        layout: sanitizeLayout(isRecord(persisted) ? persisted.layout : null),
        columnOrder: sanitizeColumnOrder(isRecord(persisted) ? persisted.columnOrder : null),
      }),
    },
  ),
);

export function openThreadInSplit(
  ref: ScopedThreadRef,
  where: "tab" | "column",
): "opened" | "full" | "no-layout" {
  const { layout, maxColumns, setLayout } = useSplitLayoutStore.getState();
  if (!layout) return "no-layout";
  const tab: PaneTab = { kind: "server", threadRef: ref };
  const next =
    where === "tab"
      ? openTab(layout, layout.activePaneId, tab)
      : openBeside(layout, layout.activePaneId, "right", tab, maxColumns);
  if (!next) return "full";
  setLayout(next);
  return "opened";
}

export function closeThreadInSplitLayout(ref: ScopedThreadRef): boolean {
  const { layout, setLayout } = useSplitLayoutStore.getState();
  const key = scopedThreadKey(ref);
  if (!layout || !locateTab(layout, key)) return false;
  const next = closeThread(layout, key);
  if (!next) return false;
  setLayout(next);
  return true;
}

export function isThreadVisibleInSplit(ref: ScopedThreadRef): boolean {
  const { layout, visibleColumnCount } = useSplitLayoutStore.getState();
  return layout !== null && visibleTabKeys(layout, visibleColumnCount).has(scopedThreadKey(ref));
}
