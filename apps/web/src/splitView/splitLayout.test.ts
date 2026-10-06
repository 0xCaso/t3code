import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { DraftId } from "../composerDraftStore";
import {
  activeTab,
  allPanes,
  closePane,
  closeTab,
  closeThread,
  createLayout,
  focusNeighbor,
  hasPaneChrome,
  moveTab,
  openBeside,
  openTab,
  paneTabKey,
  retargetTab,
  showTarget,
  visibleTabKeys,
  type PaneTab,
  type SplitLayout,
} from "./splitLayout";

const tab = (id: string): PaneTab => ({
  kind: "server",
  threadRef: scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id)),
});
const draft = (id: string): PaneTab => ({ kind: "draft", draftId: id as DraftId });
const keysOf = (layout: SplitLayout) =>
  layout.columns.map((column) => column.panes.map((pane) => pane.tabs.map(paneTabKey)));
const must = (layout: SplitLayout | null): SplitLayout => {
  if (!layout) throw new Error("expected a layout");
  return layout;
};

describe("splitLayout", () => {
  it("starts as one pane with one tab and no chrome", () => {
    const layout = createLayout(tab("a"));
    expect(keysOf(layout)).toEqual([[["env:a"]]]);
    expect(hasPaneChrome(layout)).toBe(false);
    expect(paneTabKey(activeTab(layout))).toBe("env:a");
  });

  it("shows chrome once a pane has a second tab", () => {
    expect(openTab(createLayout(tab("a")), "pane-missing", tab("b"))).toBeNull();
    const base = createLayout(tab("a"));
    const withTab = must(openTab(base, base.activePaneId, tab("b")));
    expect(hasPaneChrome(withTab)).toBe(true);
    expect(paneTabKey(activeTab(withTab))).toBe("env:b");
  });

  it("rejects a fifth tab", () => {
    let layout = createLayout(tab("a"));
    for (const id of ["b", "c", "d"]) layout = must(openTab(layout, layout.activePaneId, tab(id)));
    expect(openTab(layout, layout.activePaneId, tab("e"))).toBeNull();
  });

  it("focuses a thread that is already open instead of duplicating it", () => {
    const base = createLayout(tab("a"));
    const split = must(openBeside(base, base.activePaneId, "right", tab("b"), 4));
    const firstPaneId = base.activePaneId;
    const shown = showTarget(split, tab("a"), "replace");
    expect(shown.activePaneId).toBe(firstPaneId);
    expect(keysOf(shown)).toEqual([[["env:a"]], [["env:b"]]]);
    expect(must(openTab(split, split.activePaneId, tab("a"))).activePaneId).toBe(firstPaneId);
  });

  it("replaces the active tab for a route the layout does not hold", () => {
    const base = createLayout(tab("a"));
    expect(keysOf(showTarget(base, tab("z"), "replace"))).toEqual([[["env:z"]]]);
    expect(keysOf(showTarget(base, tab("z"), "new-tab"))).toEqual([[["env:a", "env:z"]]]);
  });

  it("falls back to a tab when no column fits", () => {
    const base = createLayout(tab("a"));
    const layout = must(openBeside(base, base.activePaneId, "right", tab("b"), 1));
    expect(keysOf(layout)).toEqual([[["env:a", "env:b"]]]);
  });

  it("opens a column on either side with equal widths", () => {
    const base = createLayout(tab("a"));
    const layout = must(openBeside(base, base.activePaneId, "left", tab("b"), 4));
    expect(keysOf(layout)).toEqual([[["env:b"]], [["env:a"]]]);
    expect(layout.columns.map((column) => column.width)).toEqual([0.5, 0.5]);
  });

  it("stacks at most two panes, then falls back to a tab", () => {
    const base = createLayout(tab("a"));
    const two = must(openBeside(base, base.activePaneId, "bottom", tab("b"), 4));
    expect(keysOf(two)).toEqual([[["env:a"], ["env:b"]]]);
    const three = must(openBeside(two, two.activePaneId, "top", tab("c"), 4));
    expect(keysOf(three)).toEqual([[["env:a"], ["env:b", "env:c"]]]);
  });

  it("closing the active tab keeps a neighbour active", () => {
    let layout = createLayout(tab("a"));
    layout = must(openTab(layout, layout.activePaneId, tab("b")));
    layout = must(openTab(layout, layout.activePaneId, tab("c")));
    const closed = must(closeTab(layout, layout.activePaneId, 2));
    expect(paneTabKey(activeTab(closed))).toBe("env:b");
  });

  it("closing the last tab of a pane closes the pane and its empty column", () => {
    const base = createLayout(tab("a"));
    const split = must(openBeside(base, base.activePaneId, "right", tab("b"), 4));
    const closed = must(closeTab(split, split.activePaneId, 0));
    expect(keysOf(closed)).toEqual([[["env:a"]]]);
    expect(closed.activePaneId).toBe(base.activePaneId);
    expect(closed.columns[0]?.width).toBe(1);
  });

  it("never closes the last pane", () => {
    const base = createLayout(tab("a"));
    expect(closePane(base, base.activePaneId)).toBeNull();
    expect(closeTab(base, base.activePaneId, 0)).toBeNull();
  });

  it("closeThread removes the thread wherever it is", () => {
    const base = createLayout(tab("a"));
    const split = must(openBeside(base, base.activePaneId, "right", tab("b"), 4));
    expect(keysOf(must(closeThread(split, "env:b")))).toEqual([[["env:a"]]]);
    expect(closeThread(split, "env:missing")).toBe(split);
    expect(closeThread(base, "env:a")).toBeNull();
  });

  it("retargets a promoted draft in place without moving focus", () => {
    const base = createLayout(tab("a"));
    const split = must(openBeside(base, base.activePaneId, "right", draft("d1"), 4));
    const refocused = { ...split, activePaneId: base.activePaneId };
    const promoted = retargetTab(refocused, "draft:d1", tab("t1"));
    expect(keysOf(promoted)).toEqual([[["env:a"]], [["env:t1"]]]);
    expect(promoted.activePaneId).toBe(base.activePaneId);
  });

  it("moves a tab into a new column and reorders within a pane", () => {
    let layout = createLayout(tab("a"));
    layout = must(openTab(layout, layout.activePaneId, tab("b")));
    const paneId = layout.activePaneId;
    const reordered = moveTab(layout, { paneId, index: 1 }, { kind: "tab", paneId, index: 0 }, 4);
    expect(keysOf(reordered)).toEqual([[["env:b", "env:a"]]]);
    const splitOut = moveTab(
      layout,
      { paneId, index: 1 },
      { kind: "edge", paneId, side: "right" },
      4,
    );
    expect(keysOf(splitOut)).toEqual([[["env:a"]], [["env:b"]]]);
  });

  it("moving the only tab onto its own pane is a no-op", () => {
    const base = createLayout(tab("a"));
    const paneId = base.activePaneId;
    expect(moveTab(base, { paneId, index: 0 }, { kind: "edge", paneId, side: "left" }, 4)).toBe(
      base,
    );
  });

  it("moving a tab to replace on its own pane is a no-op", () => {
    let layout = createLayout(tab("a"));
    layout = must(openTab(layout, layout.activePaneId, tab("b")));
    layout = must(openTab(layout, layout.activePaneId, tab("c")));
    const paneId = layout.activePaneId;
    const unchanged = moveTab(layout, { paneId, index: 1 }, { kind: "replace", paneId }, 4);
    expect(unchanged).toBe(layout);
    expect(keysOf(unchanged)).toEqual([[["env:a", "env:b", "env:c"]]]);
  });

  it("moves focus to neighbours and stops at the edges", () => {
    const base = createLayout(tab("a"));
    const split = must(openBeside(base, base.activePaneId, "right", tab("b"), 4));
    const left = focusNeighbor(split, "left", 2);
    expect(left.activePaneId).toBe(base.activePaneId);
    expect(focusNeighbor(left, "left", 2)).toBe(left);
    expect(focusNeighbor(left, "right", 1)).toBe(left);
  });

  it("lists the visible active tabs", () => {
    let layout = createLayout(tab("a"));
    layout = must(openTab(layout, layout.activePaneId, tab("b")));
    layout = must(openBeside(layout, layout.activePaneId, "right", tab("c"), 4));
    expect([...visibleTabKeys(layout, 2)].sort()).toEqual(["env:b", "env:c"]);
    expect([...visibleTabKeys(layout, 1)]).toEqual(["env:b"]);
    expect(allPanes(layout)).toHaveLength(2);
  });
});
