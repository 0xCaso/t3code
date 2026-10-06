import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { activatePane, createLayout, openBeside, paneTabKey, type PaneTab } from "./splitLayout";
import { reconcileRoute } from "./splitRouteSync";

const tab = (id: string): PaneTab => ({
  kind: "server",
  threadRef: scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id)),
});

describe("reconcileRoute", () => {
  it("creates the layout from the first thread route", () => {
    const action = reconcileRoute({
      layout: null,
      routeTarget: tab("a"),
      lastRouteKey: null,
      openRouteIn: null,
      maxColumns: 4,
    });
    expect(action.kind).toBe("apply");
  });

  it("ignores routes that are not threads", () => {
    const action = reconcileRoute({
      layout: createLayout(tab("a")),
      routeTarget: null,
      lastRouteKey: "env:a",
      openRouteIn: null,
      maxColumns: 4,
    });
    expect(action).toEqual({ kind: "none" });
  });

  it("a new route focuses the pane that already shows it", () => {
    const base = createLayout(tab("a"));
    const split = openBeside(base, base.activePaneId, "right", tab("b"), 4)!;
    const action = reconcileRoute({
      layout: split,
      routeTarget: tab("a"),
      lastRouteKey: "env:b",
      openRouteIn: null,
      maxColumns: 4,
    });
    expect(action.kind === "apply" && action.layout.activePaneId).toBe(base.activePaneId);
  });

  it("a layout change navigates to the new active tab", () => {
    const base = createLayout(tab("a"));
    const split = openBeside(base, base.activePaneId, "right", tab("b"), 4)!;
    const focusedLeft = activatePane(split, base.activePaneId);
    const action = reconcileRoute({
      layout: focusedLeft,
      routeTarget: tab("b"),
      lastRouteKey: "env:b",
      openRouteIn: null,
      maxColumns: 4,
    });
    expect(action.kind === "navigate" && paneTabKey(action.tab)).toBe("env:a");
  });

  it("does nothing when route and layout agree", () => {
    const layout = createLayout(tab("a"));
    expect(
      reconcileRoute({
        layout,
        routeTarget: tab("a"),
        lastRouteKey: "env:a",
        openRouteIn: null,
        maxColumns: 4,
      }),
    ).toEqual({ kind: "none" });
  });

  it("opens the route as a new tab when asked to", () => {
    const layout = createLayout(tab("a"));
    const action = reconcileRoute({
      layout,
      routeTarget: tab("b"),
      lastRouteKey: "env:a",
      openRouteIn: "tab",
      maxColumns: 4,
    });
    expect(action.kind === "apply" && action.layout.columns[0]?.panes[0]?.tabs).toHaveLength(2);
  });

  it("opens the route in a new column on the right when asked to", () => {
    const layout = createLayout(tab("a"));
    const action = reconcileRoute({
      layout,
      routeTarget: tab("b"),
      lastRouteKey: "env:a",
      openRouteIn: "column",
      maxColumns: 4,
    });
    expect(
      action.kind === "apply" && action.layout.columns.map((c) => c.panes[0]?.tabs.length),
    ).toEqual([1, 1]);
    expect(
      action.kind === "apply" && paneTabKey(action.layout.columns[1]!.panes[0]!.tabs[0]!),
    ).toBe("env:b");
  });

  it("falls back to a tab when no column fits", () => {
    const layout = createLayout(tab("a"));
    const action = reconcileRoute({
      layout,
      routeTarget: tab("b"),
      lastRouteKey: "env:a",
      openRouteIn: "column",
      maxColumns: 1,
    });
    expect(action.kind === "apply" && action.layout.columns[0]?.panes[0]?.tabs).toHaveLength(2);
  });
});
