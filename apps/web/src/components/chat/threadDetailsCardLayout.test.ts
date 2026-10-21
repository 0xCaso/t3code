import { describe, expect, it } from "vite-plus/test";
import { resolveThreadDetailsCardLayout } from "./threadDetailsCardLayout";

describe("workspace card in a split view pane", () => {
  it("pins beside a centered chat only, when chat must not move", () => {
    const centered = (width: number) =>
      resolveThreadDetailsCardLayout({
        container: { width, height: 900 },
        lane: { padding: 48, minChatWidth: 640, maxChatWidth: 768 },
        frame: null,
        keepChatCentered: true,
      });
    expect(centered(1416)).toMatchObject({ x: 1124 });
    expect(centered(1415)).toBeNull();
  });
});
