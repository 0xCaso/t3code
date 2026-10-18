import { useNavigate } from "@tanstack/react-router";
import { memo } from "react";

import { ThreadTargetView, type ThreadTargetNavigation } from "../components/ThreadRouteView";
import { cn } from "../lib/utils";
import { buildThreadRouteParams } from "../threadRoutes";
import { PaneTabBar } from "./PaneTabBar";
import { PaneInteractiveContext, setPaneActivatedByKeyboard } from "./paneInteractive";
import {
  activatePane,
  closeThread,
  paneActiveTab,
  paneTabKey,
  retargetTab,
  type SplitColumn,
  type SplitPane as SplitPaneModel,
} from "./splitLayout";
import { useSplitLayoutStore } from "./splitLayoutStore";
import type { PaneTabBarControls, SplitViewSlots } from "./types";

/**
 * Memoized so a layout change only re-renders the panes whose own props changed; callers must pass
 * stable `slots` and `parkedColumns`.
 */
export const SplitPane = memo(function SplitPane(props: {
  pane: SplitPaneModel;
  active: boolean;
  chrome: boolean;
  /** Fades the pane while another one is active, so the active pane reads at a glance. */
  dimInactive: boolean;
  slots: SplitViewSlots;
  rightPanelPresentation: "inline" | "sheet";
  parkedColumns: ReadonlyArray<SplitColumn>;
}) {
  const { pane, active, chrome, slots, rightPanelPresentation, parkedColumns } = props;
  const navigate = useNavigate();
  const tab = paneActiveTab(pane);
  const tabKey = paneTabKey(tab);

  const activate = () => {
    useSplitLayoutStore.getState().update((layout) => activatePane(layout, pane.id));
  };
  const activateByPointer = () => {
    setPaneActivatedByKeyboard(false);
    activate();
  };

  const onNavigate = (next: ThreadTargetNavigation) => {
    const store = useSplitLayoutStore.getState();
    if (next.kind === "thread") {
      if (active) {
        void navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(next.threadRef),
          replace: true,
        });
      } else {
        store.update((layout) =>
          retargetTab(layout, tabKey, { kind: "server", threadRef: next.threadRef }),
        );
      }
      return;
    }
    const remaining = store.layout ? closeThread(store.layout, tabKey) : null;
    // Route sync follows the new active tab; with nothing left, behave as a lone thread view.
    if (remaining) store.setLayout(remaining);
    else if (next.redirectHome) void navigate({ to: "/", replace: true });
  };

  const renderTabBar = (controls: PaneTabBarControls | null) => (
    <PaneTabBar pane={pane} controls={controls} parkedColumns={parkedColumns} />
  );
  const chromeProps = { active, slots, rightPanelPresentation, renderTabBar };

  return (
    <PaneInteractiveContext value={!chrome || active}>
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col transition-opacity duration-150",
          props.dimInactive && !active && "opacity-75",
        )}
        data-split-pane={pane.id}
        onPointerDownCapture={activateByPointer}
        onFocusCapture={activate}
      >
        <ThreadTargetView
          target={tab}
          onNavigate={onNavigate}
          {...(chrome ? { pane: chromeProps } : {})}
        />
      </div>
    </PaneInteractiveContext>
  );
});
