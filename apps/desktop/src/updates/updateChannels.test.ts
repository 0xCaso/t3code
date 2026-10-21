import { describe, expect, it } from "vite-plus/test";

import { isCustomDesktopVersion, resolveDefaultDesktopUpdateChannel } from "./updateChannels.ts";

describe("updateChannels", () => {
  it("names only preview builds Custom, and keeps them off the nightly feed", () => {
    expect(isCustomDesktopVersion("0.0.46-preview.20261015.1")).toBe(true);
    expect(isCustomDesktopVersion("0.0.46-nightly.20261015.3145")).toBe(false);
    expect(isCustomDesktopVersion("0.0.46")).toBe(false);
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-preview.20260911.7")).toBe("latest");
  });
});
