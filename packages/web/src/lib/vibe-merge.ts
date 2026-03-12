/**
 * Intent-aware vibe merge utilities.
 *
 * Conflict model (3-way merge):
 *   base    = main at the time the feature branch was created
 *   head    = feature branch version
 *   main    = current main
 *
 * A conflict exists when the SAME file changed differently on both sides
 * since the branch was created.  Files only changed on one side are
 * auto-merged with no human input needed.
 */

export interface VibeFile {
  path: string;
  content: string;
}

export interface MergeConflict {
  /** canonical path e.g. ".vibe/features/auth.md" */
  path: string;
  /** human-readable name e.g. "auth" */
  name: string;
  /** what main looked like when the branch was cut */
  baseContent: string;
  /** what the feature branch has */
  headContent: string;
  /** what main currently has */
  mainContent: string;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getSlug(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

function toSlugMap(files: VibeFile[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of files) m.set(getSlug(f.path), f.content);
  return m;
}

// ─── Core algorithms ──────────────────────────────────────────────────────────

/**
 * Detect files where both sides changed differently since the branch was cut.
 * Returns an empty array when there are no conflicts (safe to auto-merge).
 */
export function detectConflicts(
  base: VibeFile[],
  head: VibeFile[],
  main: VibeFile[],
): MergeConflict[] {
  const baseMap = toSlugMap(base);
  const headMap = toSlugMap(head);
  const mainMap = toSlugMap(main);

  const conflicts: MergeConflict[] = [];
  for (const [slug, headContent] of headMap) {
    const baseContent = baseMap.get(slug) ?? '';
    const mainContent = mainMap.get(slug);

    const headChanged = headContent !== baseContent;
    if (!headChanged) continue;                                  // feature didn't touch this file
    if (mainContent === undefined || mainContent === baseContent) continue; // main didn't touch it
    if (mainContent === headContent) continue;                   // both changed identically

    conflicts.push({
      path: `.vibe/features/${slug}.md`,
      name: slug,
      baseContent,
      headContent,
      mainContent,
    });
  }
  return conflicts;
}

/**
 * Compute the full merged set of vibes when all conflicts are resolved.
 *
 * @param resolvedConflicts  map of slug → final resolved content (from human or AI)
 */
export function computeMergedVibes(
  base: VibeFile[],
  head: VibeFile[],
  main: VibeFile[],
  resolvedConflicts: Map<string, string> = new Map(),
): VibeFile[] {
  const baseMap = toSlugMap(base);
  const headMap = toSlugMap(head);
  const mainMap = toSlugMap(main);
  const result = new Map<string, string>();

  // Start with current main as the baseline
  for (const [slug, content] of mainMap) result.set(slug, content);

  // Apply head changes (new files or updates on the feature branch)
  for (const [slug, headContent] of headMap) {
    if (resolvedConflicts.has(slug)) {
      result.set(slug, resolvedConflicts.get(slug)!);
    } else {
      const baseContent = baseMap.get(slug) ?? '';
      const mainContent = mainMap.get(slug);
      const headChanged = headContent !== baseContent;

      if (headChanged) {
        // Feature changed it and there's no conflict → take feature version
        result.set(slug, headContent);
      } else if (mainContent === undefined) {
        // Didn't change in feature and not in main → take feature version (new file)
        result.set(slug, headContent);
      }
      // else: unchanged in feature, keep main version (already set above)
    }
  }

  return Array.from(result.entries()).map(([slug, content]) => ({
    path: `.vibe/features/${slug}.md`,
    content,
  }));
}

/**
 * Which vibe files changed between old main and new merged result.
 * Used to scope the recompile to only affected files.
 */
export function changedFiles(oldMain: VibeFile[], merged: VibeFile[]): VibeFile[] {
  const oldMap = toSlugMap(oldMain);
  return merged.filter(({ path, content }) => {
    const slug = getSlug(path);
    return oldMap.get(slug) !== content;
  });
}
