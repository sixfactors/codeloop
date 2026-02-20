/**
 * Compare two semver-style version strings.
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}

/**
 * Parse version from a codeloop-version comment in file content.
 * Also supports legacy flywheel-version for backward compatibility.
 */
export function parseVersion(content: string): string | null {
  const match = content.match(/<!--\s*(?:codeloop|flywheel)-version:\s*([\d.]+)\s*-->/);
  return match ? match[1] : null;
}
