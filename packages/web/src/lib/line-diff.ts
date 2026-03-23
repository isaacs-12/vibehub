/**
 * Minimal line-level diff (longest common subsequence).
 * Returns a list of hunks with add/remove/equal markers.
 * No external dependencies.
 */

export type DiffLineType = 'add' | 'remove' | 'equal';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  /** 1-based line number in the old (base) file, undefined for additions */
  oldNum?: number;
  /** 1-based line number in the new (head) file, undefined for removals */
  newNum?: number;
}

/**
 * Compute a line-level diff between two strings.
 * Uses an O(ND) shortest-edit-script algorithm.
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build LCS table
  const n = oldLines.length;
  const m = newLines.length;

  // For small files (vibe specs), a simple DP approach is fine
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Trace back to produce diff
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNum = 1;
  let newNum = 1;

  while (i < n || j < m) {
    if (i < n && j < m && oldLines[i] === newLines[j]) {
      result.push({ type: 'equal', content: oldLines[i], oldNum: oldNum++, newNum: newNum++ });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: 'add', content: newLines[j], newNum: newNum++ });
      j++;
    } else if (i < n) {
      result.push({ type: 'remove', content: oldLines[i], oldNum: oldNum++ });
      i++;
    }
  }

  return result;
}

/**
 * Returns true if the two texts are identical (no diff).
 */
export function isIdentical(oldText: string, newText: string): boolean {
  return oldText === newText;
}
