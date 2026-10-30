// Preview builds share nightly branding but ship without an update feed.
const PRERELEASE_VERSION_PATTERN = /^[^-+]+-(?:nightly|preview)\.\d{8}\.\d+$/;

// This fork (0xCaso/t3code) ships its own builds as previews, named "Custom".
export function isCustomDesktopVersion(version: string): boolean {
  return /^[^-+]+-preview\.\d{8}\.\d+$/.test(version);
}

export function isNightlyDesktopVersion(version: string): boolean {
  return PRERELEASE_VERSION_PATTERN.test(version);
}
