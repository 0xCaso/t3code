import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EllipsisIcon, PlusIcon, XIcon } from "lucide-react";

import { ThreadRowLeadingStatus } from "../components/ThreadStatusIndicators";
import { Button } from "../components/ui/button";
import { PanelTabCloseButton } from "../components/ui/panel-tab-close-button";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useThreadShell } from "../state/entities";
import {
  activateTab,
  closePane,
  closeTab,
  paneActiveTab,
  type PaneTab,
  type SplitColumn,
  type SplitPane,
} from "./splitLayout";
import { useSplitLayoutStore } from "./splitLayoutStore";
import type { PaneTabBarControls } from "./types";

export function PaneTabBar(props: {
  pane: SplitPane;
  controls: PaneTabBarControls;
  parkedColumns: ReadonlyArray<SplitColumn>;
}) {
  const { pane, controls } = props;
  const update = useSplitLayoutStore((state) => state.update);
  const handleNewThread = useNewThreadHandler();
  const active = paneActiveTab(pane);
  const activeShell = useThreadShell(active.kind === "server" ? active.threadRef : null);

  const newTab = () => {
    if (!activeShell) return;
    useSplitLayoutStore.getState().setOpenRouteInNewTab(true);
    void handleNewThread(scopeProjectRef(activeShell.environmentId, activeShell.projectId)).finally(
      () => useSplitLayoutStore.getState().setOpenRouteInNewTab(false),
    );
  };

  return (
    <div
      data-split-tabbar
      className="flex h-8 min-h-8 shrink-0 items-center gap-1 border-b border-border px-1"
    >
      <div role="tablist" className="flex min-w-0 flex-1 items-center gap-0.5">
        {pane.tabs.map((tab, index) => (
          <PaneTabButton
            key={
              tab.kind === "server"
                ? `${tab.threadRef.environmentId}:${tab.threadRef.threadId}`
                : tab.draftId
            }
            tab={tab}
            selected={index === pane.activeTabIndex}
            onSelect={() => update((layout) => activateTab(layout, pane.id, index))}
            onClose={() => update((layout) => closeTab(layout, pane.id, index))}
          />
        ))}
      </div>
      {/* Task 14: parked-columns chip goes here. */}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="New tab"
        disabled={!activeShell}
        onClick={newTab}
      >
        <PlusIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        ref={(node) => {
          controls.threadDetailsAnchorRef.current = node;
        }}
        aria-label="Thread details"
        onClick={controls.toggleThreadDetails}
      >
        <EllipsisIcon />
        {controls.threadDetailsAttention ? (
          <span
            className="absolute right-1 top-1 size-1.5 rounded-full bg-warning ring-2 ring-background"
            aria-hidden="true"
          />
        ) : null}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Close pane"
        onClick={() => update((layout) => closePane(layout, pane.id))}
      >
        <XIcon />
      </Button>
    </div>
  );
}

function PaneTabButton(props: {
  tab: PaneTab;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const shell = useThreadShell(props.tab.kind === "server" ? props.tab.threadRef : null);
  const title = shell?.title.trim() || (props.tab.kind === "draft" ? "New thread" : "Thread");
  return (
    <div
      role="tab"
      aria-selected={props.selected}
      tabIndex={0}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") props.onSelect();
      }}
      data-split-tab
      className="group/tab flex h-6 max-w-48 min-w-0 cursor-default items-center gap-1.5 rounded-sm px-2 text-xs aria-selected:bg-muted"
    >
      <PanelTabCloseButton label="Close tab" onClick={props.onClose}>
        {shell ? <ThreadRowLeadingStatus thread={shell} /> : null}
      </PanelTabCloseButton>
      <span className="truncate">{title}</span>
    </div>
  );
}
