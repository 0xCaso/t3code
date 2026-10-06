import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { setPaneActivatedByKeyboard, takePaneActivatedByKeyboard } from "./paneInteractive";
import { createLayout, openBeside, type PaneTab } from "./splitLayout";
import { useSplitLayoutStore } from "./splitLayoutStore";
import { runSplitViewCommand } from "./splitViewCommands";

const tab = (id: string): PaneTab => ({
  kind: "server",
  threadRef: scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id)),
});
const noActions = { startNewTab: () => {} };

describe("runSplitViewCommand keyboard activation", () => {
  beforeEach(() => {
    const base = createLayout(tab("a"));
    // The new right-hand pane becomes the active one.
    const layout = openBeside(base, base.activePaneId, "right", tab("b"), 4)!;
    useSplitLayoutStore.setState({ layout, visibleColumnCount: 2, maxColumns: 4 });
    setPaneActivatedByKeyboard(false);
  });

  it("marks the activation when a command moves the active pane, once", () => {
    runSplitViewCommand("splitView.focusLeft", noActions);
    expect(takePaneActivatedByKeyboard()).toBe(true);
    expect(takePaneActivatedByKeyboard()).toBe(false);
  });

  it("does not mark a command that leaves the active pane in place", () => {
    runSplitViewCommand("splitView.focusRight", noActions);
    runSplitViewCommand("splitView.focusPane.2", noActions);
    expect(takePaneActivatedByKeyboard()).toBe(false);
  });

  it("marks closing the active pane, since its neighbour takes over", () => {
    runSplitViewCommand("splitView.closePane", noActions);
    expect(takePaneActivatedByKeyboard()).toBe(true);
  });
});
