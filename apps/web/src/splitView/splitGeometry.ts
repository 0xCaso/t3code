import { MAX_COLUMNS, findPane, type SplitLayout } from "./splitLayout";

/** Narrowest a column may get, and the room a new column needs (stima). */
const MIN_COLUMN_WIDTH_PX = 400;

export function maxColumnsForWidth(widthPx: number): number {
  return Math.min(MAX_COLUMNS, Math.max(1, Math.floor(widthPx / MIN_COLUMN_WIDTH_PX)));
}

/** Columns past this count are parked: kept in the layout, not rendered. */
export function visibleColumnCount(layout: SplitLayout, widthPx: number): number {
  return Math.min(layout.columns.length, maxColumnsForWidth(widthPx));
}

/** Brings a parked column into the last visible slot and focuses it. */
export function unparkColumn(
  layout: SplitLayout,
  columnId: string,
  visibleCount: number,
): SplitLayout {
  const index = layout.columns.findIndex((column) => column.id === columnId);
  const column = layout.columns[index];
  if (!column || index < visibleCount) return layout;
  const rest = layout.columns.filter((_, candidate) => candidate !== index);
  const at = Math.max(0, visibleCount - 1);
  return {
    columns: [...rest.slice(0, at), column, ...rest.slice(at)],
    activePaneId: column.panes[0]?.id ?? layout.activePaneId,
  };
}

/** The active pane never ends up parked. */
export function ensureActiveVisible(layout: SplitLayout, visibleCount: number): SplitLayout {
  const position = findPane(layout, layout.activePaneId);
  const column = position ? layout.columns[position.columnIndex] : undefined;
  if (!position || !column || position.columnIndex < visibleCount) return layout;
  return { ...unparkColumn(layout, column.id, visibleCount), activePaneId: layout.activePaneId };
}

/**
 * Keeps the active pane visible and remembers the column order that cost. `order` is that
 * remembered order: it comes back once it hides nothing on screen, and is dropped when columns
 * are added or closed.
 */
export function fitColumnOrder(
  layout: SplitLayout,
  order: ReadonlyArray<string> | null,
  visibleCount: number,
): { layout: SplitLayout; order: ReadonlyArray<string> | null } {
  let current = layout;
  let remembered = order;
  if (remembered) {
    const byId = new Map(layout.columns.map((column) => [column.id, column]));
    const natural = remembered.flatMap((id) => byId.get(id) ?? []);
    if (natural.length !== layout.columns.length || remembered.length !== natural.length) {
      remembered = null;
    } else {
      const shown = new Set(natural.slice(0, visibleCount).map((column) => column.id));
      if (layout.columns.slice(0, visibleCount).every((column) => shown.has(column.id))) {
        current = natural.every((column, index) => column === layout.columns[index])
          ? layout
          : { ...layout, columns: natural };
        remembered = null;
      }
    }
  }
  const fitted = ensureActiveVisible(current, visibleCount);
  if (fitted !== current) remembered ??= current.columns.map((column) => column.id);
  return { layout: fitted, order: remembered };
}

export function visibleColumnShares(layout: SplitLayout, visibleCount: number): number[] {
  const visible = layout.columns.slice(0, visibleCount);
  const total = visible.reduce((sum, column) => sum + column.width, 0);
  return visible.map((column) => (total > 0 ? column.width / total : 1 / visible.length));
}

/** Moves the divider after column `index`; both neighbours stay at least MIN_COLUMN_WIDTH_PX. */
export function resizeShares(
  shares: ReadonlyArray<number>,
  index: number,
  deltaPx: number,
  gridWidthPx: number,
): number[] {
  const left = shares[index];
  const right = shares[index + 1];
  if (left === undefined || right === undefined || gridWidthPx <= 0) return [...shares];
  const pairPx = (left + right) * gridWidthPx;
  const minPx = Math.min(MIN_COLUMN_WIDTH_PX, pairPx / 2);
  const leftPx = Math.min(Math.max(left * gridWidthPx + deltaPx, minPx), pairPx - minPx);
  const next = [...shares];
  next[index] = leftPx / gridWidthPx;
  next[index + 1] = (pairPx - leftPx) / gridWidthPx;
  return next;
}

export function applyVisibleShares(
  layout: SplitLayout,
  shares: ReadonlyArray<number>,
): SplitLayout {
  const visibleTotal = layout.columns
    .slice(0, shares.length)
    .reduce((sum, column) => sum + column.width, 0);
  return {
    ...layout,
    columns: layout.columns.map((column, index) => {
      const share = shares[index];
      return share === undefined ? column : { ...column, width: share * visibleTotal };
    }),
  };
}

export function rightPanelPresentation(input: {
  readonly workspaceWidthPx: number;
  readonly rightPanelWidthPx: number;
  readonly visibleColumns: number;
}): "inline" | "sheet" {
  const perColumn =
    (input.workspaceWidthPx - input.rightPanelWidthPx) / Math.max(1, input.visibleColumns);
  return perColumn >= MIN_COLUMN_WIDTH_PX ? "inline" : "sheet";
}
