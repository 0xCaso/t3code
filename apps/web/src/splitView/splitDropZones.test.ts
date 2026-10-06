import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveDropPreview, resolvePaneZone, tabInsertIndex } from "./splitDropZones";
import { createLayout, openBeside, openTab, type PaneTab, type SplitLayout } from "./splitLayout";

const tab = (id: string): PaneTab => ({
  kind: "server",
  threadRef: scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id)),
});
const pane = { left: 0, top: 0, right: 1000, bottom: 800 };
const zoneAt = (x: number, y: number, composer = { left: 0, top: 650, right: 1000, bottom: 800 }) =>
  resolvePaneZone({ pane, tabBarBottom: 32, composer, point: { x, y } });

describe("resolvePaneZone", () => {
  it("maps each region of a pane", () => {
    expect(zoneAt(500, 10)).toEqual({ kind: "tabs" });
    expect(zoneAt(500, 700)).toEqual({ kind: "composer" });
    expect(zoneAt(50, 300)).toEqual({ kind: "edge", side: "left" });
    expect(zoneAt(950, 300)).toEqual({ kind: "edge", side: "right" });
    expect(zoneAt(500, 60)).toEqual({ kind: "edge", side: "top" });
    expect(zoneAt(500, 620)).toEqual({ kind: "edge", side: "bottom" });
    expect(zoneAt(500, 340)).toEqual({ kind: "replace" });
    expect(zoneAt(1200, 300)).toBeNull();
  });
});

describe("tabInsertIndex", () => {
  it("inserts before the first tab whose middle is right of the pointer", () => {
    const tabs = [
      { left: 0, top: 0, right: 100, bottom: 24 },
      { left: 100, top: 0, right: 200, bottom: 24 },
    ];
    expect(tabInsertIndex(tabs, 10)).toBe(0);
    expect(tabInsertIndex(tabs, 120)).toBe(1);
    expect(tabInsertIndex(tabs, 500)).toBe(2);
  });
});

describe("resolveDropPreview", () => {
  const single = createLayout(tab("a"));
  const paneId = single.activePaneId;
  const sidebar = { kind: "sidebar" } as const;

  it("labels each zone", () => {
    const preview = (zone: Parameters<typeof resolveDropPreview>[0]["zone"]) =>
      resolveDropPreview({
        layout: single,
        paneId,
        zone,
        tabIndex: 1,
        maxColumns: 4,
        source: sidebar,
      });
    expect(preview({ kind: "replace" })).toMatchObject({ kind: "accept", label: "Open here" });
    expect(preview({ kind: "edge", side: "right" })).toMatchObject({
      label: "New column",
      highlight: "right",
    });
    expect(preview({ kind: "edge", side: "bottom" })).toMatchObject({
      label: "New row",
      highlight: "bottom",
    });
    expect(preview({ kind: "tabs" })).toMatchObject({ label: "New tab", highlight: "tabs" });
    expect(preview({ kind: "composer" })).toEqual({ kind: "context" });
  });

  it("turns an edge into a tab when no column fits", () => {
    expect(
      resolveDropPreview({
        layout: single,
        paneId,
        zone: { kind: "edge", side: "right" },
        tabIndex: 1,
        maxColumns: 1,
        source: sidebar,
      }),
    ).toMatchObject({ label: "New tab", target: { kind: "tab", paneId } });
  });

  it("rejects a tab into a full pane", () => {
    let full: SplitLayout = single;
    for (const id of ["b", "c", "d"]) full = openTab(full, paneId, tab(id))!;
    expect(
      resolveDropPreview({
        layout: full,
        paneId,
        zone: { kind: "tabs" },
        tabIndex: 0,
        maxColumns: 4,
        source: sidebar,
      }),
    ).toEqual({ kind: "reject", label: "Tab limit reached" });
  });

  it("lets a tab reorder inside its own full pane, and treats the composer as a new row", () => {
    let full: SplitLayout = single;
    for (const id of ["b", "c", "d"]) full = openTab(full, paneId, tab(id))!;
    const source = { kind: "tab", paneId, index: 3 } as const;
    expect(
      resolveDropPreview({
        layout: full,
        paneId,
        zone: { kind: "tabs" },
        tabIndex: 0,
        maxColumns: 4,
        source,
      }),
    ).toMatchObject({ kind: "accept", label: "New tab" });
    expect(
      resolveDropPreview({
        layout: full,
        paneId,
        zone: { kind: "composer" },
        tabIndex: 0,
        maxColumns: 4,
        source,
      }),
    ).toMatchObject({ kind: "accept", label: "New row" });
  });

  it("a third row becomes a tab", () => {
    const two = openBeside(single, paneId, "bottom", tab("b"), 4)!;
    expect(
      resolveDropPreview({
        layout: two,
        paneId,
        zone: { kind: "edge", side: "top" },
        tabIndex: 1,
        maxColumns: 4,
        source: sidebar,
      }),
    ).toMatchObject({ label: "New tab" });
  });

  it("same-pane replace with 3 tabs returns none", () => {
    let full: SplitLayout = single;
    for (const id of ["b", "c"]) full = openTab(full, paneId, tab(id))!;
    const source = { kind: "tab", paneId, index: 1 } as const;
    expect(
      resolveDropPreview({
        layout: full,
        paneId,
        zone: { kind: "replace" },
        tabIndex: 0,
        maxColumns: 4,
        source,
      }),
    ).toEqual({ kind: "none" });
  });

  it("same-pane edge with 1 tab returns none", () => {
    const source = { kind: "tab", paneId, index: 0 } as const;
    expect(
      resolveDropPreview({
        layout: single,
        paneId,
        zone: { kind: "edge", side: "right" },
        tabIndex: 0,
        maxColumns: 4,
        source,
      }),
    ).toEqual({ kind: "none" });
  });
});
