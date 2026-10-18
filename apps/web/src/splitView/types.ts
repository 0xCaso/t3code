import type { ReactNode, RefCallback } from "react";

/** Window-level containers the active pane portals its chrome into. */
export interface SplitViewSlots {
  readonly header: HTMLElement | null;
  readonly terminal: HTMLElement | null;
  readonly rightPanel: HTMLElement | null;
}

export interface PaneTabBarControls {
  readonly toggleThreadDetails: () => void;
  /** Attach to the tab bar: the thread details popover anchors to it and takes its width. */
  readonly threadDetailsAnchorRef: RefCallback<HTMLElement>;
}

export interface ChatViewPane {
  readonly active: boolean;
  readonly slots: SplitViewSlots;
  readonly rightPanelPresentation: "inline" | "sheet";
  /** `null` when there is no thread view to control (it is still loading or never will). */
  readonly renderTabBar: (controls: PaneTabBarControls | null) => ReactNode;
}
