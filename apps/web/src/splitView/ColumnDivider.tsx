import type { PointerEvent as ReactPointerEvent } from "react";

import { applyVisibleShares, resizeShares, visibleColumnShares } from "./splitGeometry";
import { useSplitLayoutStore } from "./splitLayoutStore";

/** 1 px line with a wider hit area; drags the boundary between two visible columns. */
export function ColumnDivider(props: { index: number; gridWidthPx: number }) {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const store = useSplitLayoutStore.getState();
    const startLayout = store.layout;
    if (!startLayout) return;
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startShares = visibleColumnShares(startLayout, store.visibleColumnCount);

    // Every store write persists to localStorage, so pointer moves are coalesced to one write per frame.
    let latestX = startX;
    let frame: number | null = null;
    const apply = () => {
      frame = null;
      const shares = resizeShares(startShares, props.index, latestX - startX, props.gridWidthPx);
      useSplitLayoutStore.getState().update((layout) => applyVisibleShares(layout, shares));
    };
    const onMove = (move: PointerEvent) => {
      latestX = move.clientX;
      if (frame === null) frame = requestAnimationFrame(apply);
    };
    const finish = () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", finish);
      element.removeEventListener("lostpointercapture", finish);
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
        // Flush the last position so the drop lands exactly where the pointer was released.
        apply();
      }
    };
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
    element.addEventListener("lostpointercapture", finish);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      // z-10: the next column's positioned content would otherwise paint over the hit area's right half.
      className="relative z-10 w-px shrink-0 cursor-col-resize bg-border before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:content-['']"
      onPointerDown={onPointerDown}
    />
  );
}
