import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { createLayout, openBeside, paneTabKey, type PaneTab } from "./splitLayout";
import {
  closeThreadInSplitLayout,
  isThreadVisibleInSplit,
  openThreadInSplit,
  sanitizeLayout,
  useSplitLayoutStore,
} from "./splitLayoutStore";

const ref = (id: string) => scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id));
const tab = (id: string): PaneTab => ({ kind: "server", threadRef: ref(id) });

describe("sanitizeLayout", () => {
  it("rejects junk", () => {
    expect(sanitizeLayout(null)).toBeNull();
    expect(sanitizeLayout({ columns: [] })).toBeNull();
    expect(sanitizeLayout({ columns: [{ id: "c", panes: [{ id: "p", tabs: [] }] }] })).toBeNull();
  });

  it("drops bad tabs, duplicates and overflow, and repairs indexes and widths", () => {
    const layout = sanitizeLayout({
      activePaneId: "missing",
      columns: [
        {
          id: "c1",
          width: -3,
          panes: [
            {
              id: "p1",
              activeTabIndex: 9,
              tabs: [
                tab("a"),
                { kind: "server" },
                tab("a"),
                tab("b"),
                tab("c"),
                tab("d"),
                tab("e"),
              ],
            },
          ],
        },
      ],
    });
    expect(layout?.activePaneId).toBe("p1");
    const pane = layout?.columns[0]?.panes[0];
    expect(pane?.tabs.map(paneTabKey)).toEqual(["env:a", "env:b", "env:c", "env:d"]);
    expect(pane?.activeTabIndex).toBe(3);
    expect(layout?.columns[0]?.width).toBe(1);
  });

  it("round-trips a valid layout", () => {
    const base = createLayout(tab("a"));
    const split = openBeside(base, base.activePaneId, "bottom", tab("b"), 4)!;
    expect(sanitizeLayout(JSON.parse(JSON.stringify(split)))).toEqual(split);
  });
});

describe("split store helpers", () => {
  beforeEach(() =>
    useSplitLayoutStore.setState({
      layout: null,
      openRouteIn: null,
      visibleColumnCount: 1,
      maxColumns: 4,
    }),
  );

  it("opens a thread as a column, then reports when the pane is full", () => {
    expect(openThreadInSplit(ref("a"), "tab")).toBe("no-layout");
    useSplitLayoutStore.getState().setLayout(createLayout(tab("a")));
    expect(openThreadInSplit(ref("b"), "column")).toBe("opened");
    expect(useSplitLayoutStore.getState().layout?.columns).toHaveLength(2);
    for (const id of ["c", "d", "e"]) openThreadInSplit(ref(id), "tab");
    expect(openThreadInSplit(ref("f"), "tab")).toBe("full");
  });

  it("closes an archived thread only when another tab remains", () => {
    useSplitLayoutStore.getState().setLayout(createLayout(tab("a")));
    expect(closeThreadInSplitLayout(ref("a"))).toBe(false);
    openThreadInSplit(ref("b"), "column");
    expect(closeThreadInSplitLayout(ref("b"))).toBe(true);
    expect(useSplitLayoutStore.getState().layout?.columns).toHaveLength(1);
  });

  it("knows which threads are on screen", () => {
    useSplitLayoutStore.getState().setLayout(createLayout(tab("a")));
    openThreadInSplit(ref("b"), "column");
    useSplitLayoutStore.getState().setCapacity({ visibleColumnCount: 2, maxColumns: 4 });
    expect(isThreadVisibleInSplit(ref("a"))).toBe(true);
    expect(isThreadVisibleInSplit(ref("z"))).toBe(false);
  });
});
