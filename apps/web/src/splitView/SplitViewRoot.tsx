import { useNavigate } from "@tanstack/react-router";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { BackgroundThreadContext } from "../components/chat/backgroundThread";
import { SidebarInset } from "../components/ui/sidebar";
import { observeResize } from "../lib/observeResize";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  type ThreadRouteTarget,
} from "../threadRoutes";
import { ColumnDivider } from "./ColumnDivider";
import { SplitDropOverlay } from "./SplitDropOverlay";
import { SplitPane } from "./SplitPane";
import {
  maxColumnsForWidth,
  rightPanelPresentation,
  visibleColumnCount,
  visibleColumnShares,
} from "./splitGeometry";
import { allPanes, hasPaneChrome, paneTabKey, type PaneTab, type SplitColumn } from "./splitLayout";
import { useSplitLayoutStore } from "./splitLayoutStore";
import { reconcileRoute } from "./splitRouteSync";
import type { SplitViewSlots } from "./types";

/** Width the inline right panel takes; must match RightPanelTabs' default inline size (stima). */
const RIGHT_PANEL_WIDTH_ESTIMATE_PX = 480;

/** Shared by panes that do not show the parked-columns chip, so their props stay referentially equal. */
const NO_PARKED_COLUMNS: ReadonlyArray<SplitColumn> = [];

const INSET_CLASS_NAME = "h-svh min-h-0 overflow-hidden overscroll-y-none md:h-dvh";

/** A maximized right panel collapses every column, as it collapses the chat beside a single thread. */
const COLUMNS_CLASS_NAME =
  "flex min-h-0 min-w-0 flex-1 flex-col group-has-[>[data-split-right-panel-slot]>[data-preview-panel-maximized=true]]/workspace:w-0 group-has-[>[data-split-right-panel-slot]>[data-preview-panel-maximized=true]]/workspace:flex-none group-has-[>[data-split-right-panel-slot]>[data-preview-panel-maximized=true]]/workspace:overflow-hidden";

/** `background` keeps the panes mounted, inert and in place under Settings or Usage. */
export function SplitViewRoot({
  routeTarget,
  background = false,
}: {
  routeTarget: ThreadRouteTarget;
  background?: boolean;
}) {
  const navigate = useNavigate();
  const layout = useSplitLayoutStore((state) => state.layout);
  const [workspaceRef, workspaceWidth] = useMeasuredWidth();
  const [gridRef, gridWidth] = useMeasuredWidth();
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const [terminalSlot, setTerminalSlot] = useState<HTMLDivElement | null>(null);
  const [rightPanelSlot, setRightPanelSlot] = useState<HTMLDivElement | null>(null);
  const lastRouteKeyRef = useRef<string | null>(null);
  const routeKey = paneTabKey(routeTarget);

  const visibleCount = layout ? visibleColumnCount(layout, workspaceWidth) : 1;
  const maxColumns = maxColumnsForWidth(workspaceWidth);

  // Layout effect: the persisted layout never paints a frame on the wrong thread.
  // oxlint-disable-next-line t3code/react-effect-budget -- syncs the router and the layout store both ways.
  useLayoutEffect(() => {
    if (background) return;
    const state = useSplitLayoutStore.getState();
    const action = reconcileRoute({
      layout: state.layout,
      // oxlint-disable-next-line react/exhaustive-effect-dependencies -- routeTarget is identified by routeKey.
      routeTarget,
      lastRouteKey: lastRouteKeyRef.current,
      openRouteIn: state.openRouteIn,
      maxColumns,
    });
    lastRouteKeyRef.current = routeKey;
    if (action.kind === "apply") {
      state.setLayout(action.layout);
      if (state.openRouteIn) state.setOpenRouteIn(null);
    } else if (action.kind === "navigate") {
      void navigateToTab(navigate, action.tab);
    }
  }, [background, routeKey, layout, navigate, maxColumns]);
  const activePaneId = layout?.activePaneId;
  // oxlint-disable-next-line t3code/react-effect-budget -- feeds the measured width into the layout store.
  useLayoutEffect(() => {
    if (workspaceWidth <= 0) return;
    const state = useSplitLayoutStore.getState();
    state.setCapacity({ visibleColumnCount: visibleCount, maxColumns });
    state.fitColumns(visibleCount);
  }, [
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Also runs on activation: a pane activated from the sidebar or the parked chip may be parked.
    activePaneId,
    maxColumns,
    visibleCount,
    workspaceWidth,
  ]);

  // Resizing replaces `columns` but keeps parked column objects. useShallow hands back the previous
  // array while its elements are unchanged: a new reference would re-render the chip pane's ChatView per frame.
  const parkedColumns = useSplitLayoutStore(
    useShallow((state) => state.layout?.columns.slice(visibleCount) ?? NO_PARKED_COLUMNS),
  );
  const slots: SplitViewSlots = {
    header: headerSlot,
    terminal: terminalSlot,
    rightPanel: rightPanelSlot,
  };

  if (!layout) return <SidebarInset className={INSET_CLASS_NAME} inert={background} />;

  const chrome = hasPaneChrome(layout);
  const dimInactive = allPanes(layout).length > 1;
  const visibleColumns = layout.columns.slice(0, visibleCount);
  const shares = visibleColumnShares(layout, visibleCount);
  const presentation = rightPanelPresentation({
    workspaceWidthPx: workspaceWidth,
    rightPanelWidthPx: RIGHT_PANEL_WIDTH_ESTIMATE_PX,
    visibleColumns: visibleCount,
  });

  return (
    <SidebarInset className={INSET_CLASS_NAME} inert={background}>
      <BackgroundThreadContext value={background}>
        <div ref={workspaceRef} className="group/workspace flex min-h-0 min-w-0 flex-1">
          <div className={COLUMNS_CLASS_NAME}>
            {chrome ? <div ref={setHeaderSlot} className="contents" /> : null}
            <div ref={gridRef} className="flex min-h-0 min-w-0 flex-1">
              {visibleColumns.map((column, columnIndex) => (
                <Fragment key={column.id}>
                  {columnIndex > 0 ? (
                    <ColumnDivider index={columnIndex - 1} gridWidthPx={gridWidth} />
                  ) : null}
                  <div
                    className="flex min-h-0 min-w-0 flex-col"
                    style={{ flexBasis: 0, flexGrow: shares[columnIndex] ?? 1 }}
                  >
                    {column.panes.map((pane, paneIndex) => (
                      <Fragment key={pane.id}>
                        {paneIndex > 0 ? (
                          <div aria-hidden className="h-px shrink-0 bg-border" />
                        ) : null}
                        <SplitPane
                          pane={pane}
                          active={pane.id === layout.activePaneId}
                          chrome={chrome}
                          dimInactive={dimInactive}
                          slots={slots}
                          rightPanelPresentation={presentation}
                          parkedColumns={
                            paneIndex === 0 && columnIndex === visibleColumns.length - 1
                              ? parkedColumns
                              : NO_PARKED_COLUMNS
                          }
                        />
                      </Fragment>
                    ))}
                  </div>
                </Fragment>
              ))}
            </div>
            {chrome ? <div ref={setTerminalSlot} className="contents" /> : null}
          </div>
          {chrome ? (
            <div ref={setRightPanelSlot} className="contents" data-split-right-panel-slot />
          ) : null}
        </div>
        <SplitDropOverlay />
      </BackgroundThreadContext>
    </SidebarInset>
  );
}

function navigateToTab(navigate: ReturnType<typeof useNavigate>, tab: PaneTab) {
  return tab.kind === "server"
    ? navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(tab.threadRef) })
    : navigate({ to: "/draft/$draftId", params: buildDraftThreadRouteParams(tab.draftId) });
}

/** Tracks an element's width, committed in the same frame as the resize. Zero until measured. */
function useMeasuredWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  // oxlint-disable-next-line t3code/react-effect-budget -- subscribes to a ResizeObserver.
  useLayoutEffect(() => {
    if (!element) return;
    return observeResize(element, (entries) => {
      const entry = entries.at(-1);
      if (entry) setWidth(entry.contentRect.width);
    });
  }, [element]);
  return [setElement, width] as const;
}
