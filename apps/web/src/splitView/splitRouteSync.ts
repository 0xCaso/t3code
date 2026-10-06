import {
  activeTab,
  createLayout,
  paneTabKey,
  showTarget,
  type PaneTab,
  type SplitLayout,
} from "./splitLayout";

export type RouteSyncAction =
  | { readonly kind: "none" }
  | { readonly kind: "apply"; readonly layout: SplitLayout }
  | { readonly kind: "navigate"; readonly tab: PaneTab };

/**
 * The route names the active pane's active tab. A route change moves the layout
 * (sidebar clicks, toasts, back/forward); a layout change moves the route (clicking
 * another pane or tab). `lastRouteKey` tells the two apart.
 */
export function reconcileRoute(input: {
  readonly layout: SplitLayout | null;
  readonly routeTarget: PaneTab | null;
  readonly lastRouteKey: string | null;
  readonly openRouteIn: "tab" | "column" | null;
  readonly maxColumns: number;
}): RouteSyncAction {
  const { layout, routeTarget } = input;
  if (!routeTarget) return { kind: "none" };
  if (!layout) return { kind: "apply", layout: createLayout(routeTarget) };
  const routeKey = paneTabKey(routeTarget);
  if (routeKey !== input.lastRouteKey) {
    const mode =
      input.openRouteIn === "tab"
        ? "new-tab"
        : input.openRouteIn === "column"
          ? "new-column"
          : "replace";
    const next = showTarget(layout, routeTarget, mode, input.maxColumns);
    return next === layout ? { kind: "none" } : { kind: "apply", layout: next };
  }
  const tab = activeTab(layout);
  return paneTabKey(tab) === routeKey ? { kind: "none" } : { kind: "navigate", tab };
}
