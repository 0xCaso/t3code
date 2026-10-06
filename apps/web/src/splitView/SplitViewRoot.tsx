import { useNavigate } from "@tanstack/react-router";
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { SidebarInset } from "../components/ui/sidebar";
import { useElementWidth } from "../hooks/useElementWidth";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  type ThreadRouteTarget,
} from "../threadRoutes";
import { ColumnDivider } from "./ColumnDivider";
import { SplitDropOverlay } from "./SplitDropOverlay";
import { SplitPane } from "./SplitPane";
import {
  ensureActiveVisible,
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

export function SplitViewRoot({ routeTarget }: { routeTarget: ThreadRouteTarget }) {
  const navigate = useNavigate();
  const layout = useSplitLayoutStore((state) => state.layout);
  const [workspaceRef, measuredWidth] = useElementWidth<HTMLDivElement>();
  const workspaceWidth = measuredWidth ?? 0;
  const [gridRef, measuredGridWidth] = useElementWidth<HTMLDivElement>();
  const gridWidth = measuredGridWidth ?? 0;
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const [terminalSlot, setTerminalSlot] = useState<HTMLDivElement | null>(null);
  const [rightPanelSlot, setRightPanelSlot] = useState<HTMLDivElement | null>(null);
  const lastRouteKeyRef = useRef<string | null>(null);
  const routeKey = paneTabKey(routeTarget);

  // Layout effect: the persisted layout never paints a frame on the wrong thread.
  useLayoutEffect(() => {
    const state = useSplitLayoutStore.getState();
    const action = reconcileRoute({
      layout: state.layout,
      routeTarget,
      lastRouteKey: lastRouteKeyRef.current,
      openRouteInNewTab: state.openRouteInNewTab,
    });
    lastRouteKeyRef.current = routeKey;
    if (action.kind === "apply") {
      state.setLayout(action.layout);
      if (state.openRouteInNewTab) state.setOpenRouteInNewTab(false);
    } else if (action.kind === "navigate") {
      void navigateToTab(navigate, action.tab);
    }
    // routeTarget is identified by routeKey.
  }, [routeKey, layout, navigate]);

  const visibleCount = layout ? visibleColumnCount(layout, workspaceWidth) : 1;
  const maxColumns = maxColumnsForWidth(workspaceWidth);
  useLayoutEffect(() => {
    if (workspaceWidth <= 0) return;
    const state = useSplitLayoutStore.getState();
    state.setCapacity({ visibleColumnCount: visibleCount, maxColumns });
    state.update((current) => ensureActiveVisible(current, visibleCount));
  }, [maxColumns, visibleCount, workspaceWidth]);

  // Resizing replaces `columns` but keeps parked column objects. useShallow hands back the previous
  // array while its elements are unchanged: a new reference would re-render the chip pane's ChatView per frame.
  const parkedColumns = useSplitLayoutStore(
    useShallow((state) => state.layout?.columns.slice(visibleCount) ?? NO_PARKED_COLUMNS),
  );
  const slots = useMemo<SplitViewSlots>(
    () => ({ header: headerSlot, terminal: terminalSlot, rightPanel: rightPanelSlot }),
    [headerSlot, terminalSlot, rightPanelSlot],
  );

  if (!layout) return <SidebarInset className={INSET_CLASS_NAME} />;

  const chrome = hasPaneChrome(layout);
  const showActiveBorder = allPanes(layout).length > 1;
  const visibleColumns = layout.columns.slice(0, visibleCount);
  const shares = visibleColumnShares(layout, visibleCount);
  const presentation = rightPanelPresentation({
    workspaceWidthPx: workspaceWidth,
    rightPanelWidthPx: RIGHT_PANEL_WIDTH_ESTIMATE_PX,
    visibleColumns: visibleCount,
  });

  return (
    <SidebarInset className={INSET_CLASS_NAME}>
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
                        showActiveBorder={showActiveBorder}
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
    </SidebarInset>
  );
}

function navigateToTab(navigate: ReturnType<typeof useNavigate>, tab: PaneTab) {
  return tab.kind === "server"
    ? navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(tab.threadRef) })
    : navigate({ to: "/draft/$draftId", params: buildDraftThreadRouteParams(tab.draftId) });
}
