import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyVisibleShares,
  ensureActiveVisible,
  fitColumnOrder,
  maxColumnsForWidth,
  resizeShares,
  rightPanelPresentation,
  unparkColumn,
  visibleColumnCount,
  visibleColumnShares,
} from "./splitGeometry";
import {
  createLayout,
  openBeside,
  paneTabKey,
  type PaneTab,
  type SplitLayout,
} from "./splitLayout";

const tab = (id: string): PaneTab => ({
  kind: "server",
  threadRef: scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id)),
});
function threeColumns(): SplitLayout {
  let layout = createLayout(tab("a"));
  for (const id of ["b", "c"]) {
    const next = openBeside(layout, layout.activePaneId, "right", tab(id), 4);
    if (!next) throw new Error("expected a layout");
    layout = next;
  }
  return layout;
}
const firstKeys = (layout: SplitLayout) =>
  layout.columns.map((column) => paneTabKey(column.panes[0]!.tabs[0]!));

describe("splitGeometry", () => {
  it("fits one column per 400 px, between 1 and 4", () => {
    expect(maxColumnsForWidth(300)).toBe(1);
    expect(maxColumnsForWidth(1250)).toBe(3);
    expect(maxColumnsForWidth(5000)).toBe(4);
  });

  it("parks the right-hand columns that do not fit", () => {
    expect(visibleColumnCount(threeColumns(), 900)).toBe(2);
    expect(visibleColumnCount(threeColumns(), 2000)).toBe(3);
  });

  it("unparks a column into the last visible slot", () => {
    const layout = threeColumns();
    const parked = layout.columns[2]!;
    const next = unparkColumn(layout, parked.id, 2);
    expect(firstKeys(next)).toEqual(["env:a", "env:c", "env:b"]);
    expect(next.activePaneId).toBe(parked.panes[0]!.id);
  });

  it("keeps the active pane visible when the window narrows", () => {
    const layout = threeColumns(); // active pane is in column 3
    const next = ensureActiveVisible(layout, 2);
    expect(firstKeys(next)).toEqual(["env:a", "env:c", "env:b"]);
    expect(next.activePaneId).toBe(layout.activePaneId);
    expect(ensureActiveVisible(layout, 3)).toBe(layout);
  });

  it("restores the column order once the window widens again", () => {
    const layout = threeColumns(); // active pane is in column 3
    const narrow = fitColumnOrder(layout, null, 2);
    expect(firstKeys(narrow.layout)).toEqual(["env:a", "env:c", "env:b"]);
    // Still too narrow: restoring would hide the active column.
    expect(fitColumnOrder(narrow.layout, narrow.order, 2)).toEqual(narrow);
    const wide = fitColumnOrder(narrow.layout, narrow.order, 3);
    expect(firstKeys(wide.layout)).toEqual(["env:a", "env:b", "env:c"]);
    expect(wide.order).toBeNull();
  });

  it("forgets the remembered order once columns are added or closed", () => {
    const layout = threeColumns();
    const narrow = fitColumnOrder(layout, null, 2);
    const closed = { ...narrow.layout, columns: narrow.layout.columns.slice(0, 2) };
    const next = fitColumnOrder(closed, narrow.order, 2);
    expect(next.layout).toBe(closed);
    expect(next.order).toBeNull();
  });

  it("rescales visible shares to fill the grid", () => {
    expect(visibleColumnShares(threeColumns(), 2)).toEqual([0.5, 0.5]);
  });

  it("resizes two neighbours without taking either under 400 px", () => {
    expect(resizeShares([0.5, 0.5], 0, 100, 1000)).toEqual([0.6, 0.4]);
    expect(resizeShares([0.5, 0.5], 0, 400, 1000)).toEqual([0.6, 0.4]);
    expect(resizeShares([0.5, 0.5], 0, -400, 1000)).toEqual([0.4, 0.6]);
  });

  it("writes visible shares back and leaves parked columns alone", () => {
    const layout = threeColumns();
    const next = applyVisibleShares(layout, [0.25, 0.75]);
    const widths = next.columns.map((column) => column.width);
    expect(widths[0]! / widths[1]!).toBeCloseTo(1 / 3);
    expect(widths[2]).toBe(layout.columns[2]!.width);
  });

  it("puts the right panel beside the grid only while columns keep 400 px", () => {
    expect(
      rightPanelPresentation({ workspaceWidthPx: 1600, rightPanelWidthPx: 480, visibleColumns: 2 }),
    ).toBe("inline");
    expect(
      rightPanelPresentation({ workspaceWidthPx: 1600, rightPanelWidthPx: 480, visibleColumns: 3 }),
    ).toBe("sheet");
  });
});
