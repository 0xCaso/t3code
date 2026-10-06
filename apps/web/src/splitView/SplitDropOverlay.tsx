import { createPortal } from "react-dom";

import { useSplitDrag } from "./splitDrag";

/** Drop highlight and label. Exists only while a drag is in progress. */
export function SplitDropOverlay() {
  const drag = useSplitDrag();
  if (!drag) return null;
  const { highlight, preview } = drag;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      {highlight && (preview?.kind === "accept" || preview?.kind === "reject") ? (
        <div
          className={
            preview.kind === "reject"
              ? "absolute flex items-center justify-center rounded-md border-2 border-destructive bg-destructive/10"
              : "absolute flex items-center justify-center rounded-md border-2 border-primary bg-primary/15"
          }
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.right - highlight.left,
            height: highlight.bottom - highlight.top,
          }}
        >
          <span className="rounded-sm bg-background px-2 py-0.5 text-xs font-medium shadow-sm">
            {preview.label}
          </span>
        </div>
      ) : null}
      {drag.source.kind === "tab" ? (
        <div
          className="absolute max-w-56 truncate rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md"
          style={{ left: drag.point.x + 12, top: drag.point.y + 12 }}
        >
          {drag.title}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
