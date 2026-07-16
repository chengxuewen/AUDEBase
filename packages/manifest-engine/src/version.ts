/**
 * SemVer version comparison utilities
 */

interface ParsedSemVer {
  major: number
  minor: number
  patch: number
  prerelease: (string | number)[]
  build: string[]
}

function parseSemVer(version: string): ParsedSemVer {
  // Strip build metadata for comparison (SemVer spec: build metadata is ignored)
  const buildMatch = version.match(/\+([\w.]+)$/)
  const build = buildMatch && buildMatch[1] ? buildMatch[1].split('.') : []

  // Strip build from version string
  const withoutBuild = version.replace(/\+[\w.]+$/, '')

  // Check for prerelease
  const preMatch = withoutBuild.match(/-([\w.]+)$/)
  const prerelease =
    preMatch && preMatch[1] ? preMatch[1].split('.').map((p) => (p.match(/^\d+$/) ? parseInt(p, 10) : p)) : []

  const coreVersion = withoutBuild.replace(/-[\w.]+$/, '')
  const [major, minor, patch] = coreVersion.split('.').map((n) => parseInt(n, 10))

  return {
    major: major ?? 0,
    minor: minor ?? 0,
    patch: patch ?? 0,
    prerelease,
    build,
  }
}

function comparePrerelease(a: (string | number)[], b: (string | number)[]): number {
  // No prerelease > has prerelease (1.0.0 > 1.0.0-alpha)
  if (a.length === 0 && b.length > 0) return 1
  if (a.length > 0 && b.length === 0) return -1
  if (a.length === 0 && b.length === 0) return 0

  const maxLen = Math.max(a.length, b.length)
  for (let i = 0; i < maxLen; i++) {
    const aVal = a[i]
    const bVal = b[i]

    // Shorter prerelease wins if all preceding are equal
    if (aVal === undefined && bVal !== undefined) return -1
    if (aVal !== undefined && bVal === undefined) return 1
    if (aVal === undefined || bVal === undefined) return 0

    // Both numbers -> numeric comparison
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      if (aVal < bVal) return -1
      if (aVal > bVal) return 1
      continue
    }

    // Number < string (numeric identifiers have lower precedence)
    if (typeof aVal === 'number' && typeof bVal === 'string') return -1
    if (typeof aVal === 'string' && typeof bVal === 'number') return 1

    // Both strings -> lexical comparison
    if (aVal < bVal) return -1
    if (aVal > bVal) return 1
  }

  return 0
}

export function compareVersions(a: string, b: string): number {
  const pa = parseSemVer(a)
  const pb = parseSemVer(b)

  if (pa.major !== pb.major) return pa.major - pb.major
  if (pa.minor !== pb.minor) return pa.minor - pb.minor
  if (pa.patch !== pb.patch) return pa.patch - pb.patch

  return comparePrerelease(pa.prerelease, pb.prerelease)
}

export function isVersionGt(a: string, b: string): boolean {
  return compareVersions(a, b) > 0
}

export function semverSort(versions: string[]): string[] {
  return [...versions].sort(compareVersions)
}
