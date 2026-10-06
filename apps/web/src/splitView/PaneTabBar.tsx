import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EllipsisIcon, PlusIcon, XIcon } from "lucide-react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import { ThreadRowLeadingStatus } from "../components/ThreadStatusIndicators";
import { Button } from "../components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../components/ui/menu";
import { PanelTabCloseButton } from "../components/ui/panel-tab-close-button";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useThreadShell } from "../state/entities";
import {
  activateTab,
  closePane,
  closeTab,
  moveTab,
  paneActiveTab,
  type PaneTab,
  type SplitColumn,
  type SplitPane,
} from "./splitLayout";
import { unparkColumn } from "./splitGeometry";
import { beginSplitDrag, endSplitDrag, moveSplitDrag } from "./splitDrag";
import { useSplitLayoutStore } from "./splitLayoutStore";
import type { PaneTabBarControls } from "./types";

export function PaneTabBar(props: {
  pane: SplitPane;
  controls: PaneTabBarControls | null;
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
            paneId={pane.id}
            index={index}
            selected={index === pane.activeTabIndex}
            onSelect={() => update((layout) => activateTab(layout, pane.id, index))}
            onClose={() => update((layout) => closeTab(layout, pane.id, index))}
          />
        ))}
      </div>
      {props.parkedColumns.length > 0 ? <ParkedColumnsMenu columns={props.parkedColumns} /> : null}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="New tab"
        disabled={!activeShell}
        onClick={newTab}
      >
        <PlusIcon />
      </Button>
      {controls ? (
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
      ) : null}
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

/** "+N" chip: columns that do not fit are parked; picking one brings it back into the last visible slot. */
function ParkedColumnsMenu(props: { columns: ReadonlyArray<SplitColumn> }) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="xs" aria-label="Show hidden columns" />}>
        +{props.columns.length}
      </MenuTrigger>
      <MenuPopup align="end" side="bottom" sideOffset={6} className="max-w-56">
        {props.columns.map((column) => (
          <ParkedColumnItem key={column.id} column={column} />
        ))}
      </MenuPopup>
    </Menu>
  );
}

function ParkedColumnItem(props: { column: SplitColumn }) {
  const { column } = props;
  const tab = column.panes[0] ? paneActiveTab(column.panes[0]) : null;
  const shell = useThreadShell(tab?.kind === "server" ? tab.threadRef : null);
  const title = shell?.title.trim() || (tab?.kind === "draft" ? "New thread" : "Thread");
  return (
    <MenuItem
      onClick={() => {
        const { visibleColumnCount, update } = useSplitLayoutStore.getState();
        update((layout) => unparkColumn(layout, column.id, visibleColumnCount));
      }}
    >
      <span className="min-w-0 truncate">{title}</span>
    </MenuItem>
  );
}

function PaneTabButton(props: {
  tab: PaneTab;
  paneId: string;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const shell = useThreadShell(props.tab.kind === "server" ? props.tab.threadRef : null);
  const title = shell?.title.trim() || (props.tab.kind === "draft" ? "New thread" : "Thread");
  // Set when a pointer drag ends so the click that follows does not re-activate the tab.
  const draggedRef = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    draggedRef.current = false;
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;
    const element = event.currentTarget;
    const onMove = (move: PointerEvent) => {
      const point = { x: move.clientX, y: move.clientY };
      if (!dragging && Math.hypot(point.x - start.x, point.y - start.y) < 4) return;
      if (!dragging) {
        dragging = true;
        draggedRef.current = true;
        element.setPointerCapture(event.pointerId);
        beginSplitDrag({ kind: "tab", paneId: props.paneId, index: props.index }, title, point);
      }
      moveSplitDrag(point);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      if (!dragging) return;
      const result = endSplitDrag();
      if (!commit || !result || result.preview.kind !== "accept") return;
      const target = result.preview.target;
      const { maxColumns } = useSplitLayoutStore.getState();
      useSplitLayoutStore
        .getState()
        .update((layout) =>
          moveTab(layout, { paneId: props.paneId, index: props.index }, target, maxColumns),
        );
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (key: KeyboardEvent) => {
      if (key.key === "Escape") finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  };

  return (
    <div
      role="tab"
      aria-selected={props.selected}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={() => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        props.onSelect();
      }}
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
