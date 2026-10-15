import { describe, expect, it } from "vite-plus/test";

import {
  isCustomDesktopVersion,
  isNightlyDesktopVersion,
  resolveDefaultDesktopUpdateChannel,
} from "./updateChannels.ts";

describe("updateChannels", () => {
  it("keeps preview builds branded as nightly but on the latest update channel", () => {
    expect(isNightlyDesktopVersion("0.0.41-preview.20260911.7")).toBe(true);
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-preview.20260911.7")).toBe("latest");
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-nightly.20260911.7")).toBe("nightly");
  });

  it("names only preview builds Custom", () => {
    expect(isCustomDesktopVersion("0.0.46-preview.20261015.1")).toBe(true);
    expect(isCustomDesktopVersion("0.0.46-nightly.20261015.3145")).toBe(false);
    expect(isCustomDesktopVersion("0.0.46")).toBe(false);
  });

  it("only matches the first prerelease identifier", () => {
    expect(isNightlyDesktopVersion("1.2.3-foo-preview.20260911.1")).toBe(false);
    expect(isNightlyDesktopVersion("1.2.3")).toBe(false);
  });
});
