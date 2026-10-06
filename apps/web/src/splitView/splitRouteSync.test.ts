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
      openRouteInNewTab: false,
    });
    expect(action.kind).toBe("apply");
  });

  it("ignores routes that are not threads", () => {
    const action = reconcileRoute({
      layout: createLayout(tab("a")),
      routeTarget: null,
      lastRouteKey: "env:a",
      openRouteInNewTab: false,
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
      openRouteInNewTab: false,
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
      openRouteInNewTab: false,
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
        openRouteInNewTab: false,
      }),
    ).toEqual({ kind: "none" });
  });

  it("opens the route as a new tab when asked to", () => {
    const layout = createLayout(tab("a"));
    const action = reconcileRoute({
      layout,
      routeTarget: tab("b"),
      lastRouteKey: "env:a",
      openRouteInNewTab: true,
    });
    expect(action.kind === "apply" && action.layout.columns[0]?.panes[0]?.tabs).toHaveLength(2);
  });
});
