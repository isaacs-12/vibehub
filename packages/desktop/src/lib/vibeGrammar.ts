/**
 * Default content for a new vibe feature file.
 * The placeholder TOKEN is replaced with the feature slug at creation time.
 */
export const FEATURE_TEMPLATE = (slug: string) =>
  `---\nUses: []\nData: []\nNever: []\nConnects: []\n---\n\n# ${slug}\n\n## What it does\nDescribe the feature in plain language. What can a user do, and what happens when they do it?\n\n## Behavior\n- Add specific rules, edge cases, or conditions here\n- Each bullet is something the compiler should implement\n\n## Acceptance criteria\n- How do you know this feature is working correctly?\n`;

/**
 * Vibe grammar: structured frontmatter for feature specs.
 *
 * Format:
 *   ---
 *   Uses: [Authentication, PaymentFlow]
 *   Data: [Subscription, PaymentMethod]
 *   Never:
 *     - Store card numbers directly
 *     - Allow free trial after cancellation
 *   ---
 *
 *   Prose body here...
 *
 * Rules:
 *   - All names are PascalCase (VariableName not variable-name)
 *   - Uses: declares dependencies on other feature specs
 *   - Data: declares data entities this feature touches
 *   - Never: hard constraints fed to the compiler as invariants
 */

export interface VibeGrammar {
  Uses: string[];
  Data: string[];
  Never: string[];
  Connects: string[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseVibeGrammar(content: string): { grammar: VibeGrammar; body: string } {
  const grammar: VibeGrammar = { Uses: [], Data: [], Never: [], Connects: [] };
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { grammar, body: content };

  const fm = match[1] ?? '';
  const body = match[2] ?? '';

  // Uses: [A, B, C]
  const usesMatch = fm.match(/^Uses:\s*\[([^\]]*)\]/m);
  if (usesMatch) {
    grammar.Uses = usesMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Data: [A, B, C]
  const dataMatch = fm.match(/^Data:\s*\[([^\]]*)\]/m);
  if (dataMatch) {
    grammar.Data = dataMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Never: (list items on subsequent lines)
  const neverIdx = fm.search(/^Never:/m);
  if (neverIdx !== -1) {
    const neverRest = fm.slice(neverIdx + 'Never:'.length);
    // Inline list: Never: [A, B]
    const inlineMatch = neverRest.match(/^\s*\[([^\]]*)\]/);
    if (inlineMatch) {
      grammar.Never = inlineMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      // Block list: each line starting with "  - "
      grammar.Never = neverRest
        .split('\n')
        .filter((l) => /^\s+-\s+/.test(l))
        .map((l) => l.replace(/^\s+-\s+/, '').trim())
        .filter(Boolean);
    }
  }

  // Connects: [A, B, C]
  const connectsMatch = fm.match(/^Connects:\s*\[([^\]]*)\]/m);
  if (connectsMatch) {
    grammar.Connects = connectsMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
  }

  return { grammar, body };
}

export function serializeVibeGrammar(grammar: VibeGrammar, body: string): string {
  const lines: string[] = ['---'];
  lines.push(`Uses: [${grammar.Uses.join(', ')}]`);
  lines.push(`Data: [${grammar.Data.join(', ')}]`);
  if (grammar.Never.length > 0) {
    lines.push('Never:');
    for (const item of grammar.Never) lines.push(`  - ${item}`);
  } else {
    lines.push('Never: []');
  }
  lines.push(`Connects: [${grammar.Connects.join(', ')}]`);
  lines.push('---');
  lines.push('');
  return lines.join('\n') + body;
}

/** "user-authentication" or "auth/login" → "UserAuthentication" / "AuthLogin" */
export function toGrammarName(slug: string): string {
  return slug
    .split(/[-/]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/** "UserAuthentication" → "user-authentication" */
export function fromGrammarName(name: string): string {
  return name
    .replace(/([A-Z])/g, (ch, _letter, offset) =>
      offset === 0 ? ch.toLowerCase() : `-${ch.toLowerCase()}`,
    );
}

/** Return the full grammar name for a feature given its path, e.g. ".vibe/features/auth/login.md" → "AuthLogin" */
export function featurePathToGrammarName(path: string): string {
  const slug = path
    .replace(/^\.vibe[/\\]features[/\\]/, '')
    .replace(/\.md$/, '');
  return toGrammarName(slug);
}

/**
 * Build a slug-keyed adjacency map from all feature contents.
 * { "payments": ["authentication", "user-profiles"], ... }
 */
export function buildDependencyGraph(
  features: Array<{ slug: string; content: string }>,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const { slug, content } of features) {
    const { grammar } = parseVibeGrammar(content);
    graph.set(slug, grammar.Uses.map(fromGrammarName));
  }
  return graph;
}

/**
 * Returns true if adding the edge fromSlug → toSlug would create a cycle.
 * Cycles are detected by checking whether toSlug can already reach fromSlug
 * in the existing graph (DFS).
 */
export function wouldCreateCycle(
  fromSlug: string,
  toSlug: string,
  graph: Map<string, string[]>,
): boolean {
  if (fromSlug === toSlug) return true;
  const visited = new Set<string>();
  const stack = [toSlug];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromSlug) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const dep of graph.get(current) ?? []) stack.push(dep);
  }
  return false;
}
