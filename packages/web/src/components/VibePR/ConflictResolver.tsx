'use client';

import React, { useState } from 'react';
import { GitMerge, Loader2, CheckCircle2, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import type { MergeConflict } from '@/lib/vibe-merge';

type Resolution =
  | { type: 'head' }
  | { type: 'main' }
  | { type: 'feathered'; content: string };

interface Props {
  prId: string;
  conflicts: MergeConflict[];
  onMerged: () => void;
  onCancel: () => void;
}

export default function ConflictResolver({ prId, conflicts, onMerged, onCancel }: Props) {
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [feathering, setFeathering] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(conflicts.map((c) => c.name)),
  );

  const allResolved = conflicts.every((c) => resolutions[c.name] !== undefined);

  function setResolution(name: string, r: Resolution) {
    setResolutions((prev) => ({ ...prev, [name]: r }));
  }

  async function handleFeather(conflict: MergeConflict) {
    setFeathering(conflict.name);
    try {
      const res = await fetch(`/api/prs/${prId}/feather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: conflict.name,
          baseContent: conflict.baseContent,
          headContent: conflict.headContent,
          mainContent: conflict.mainContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Feather failed');
      setResolution(conflict.name, { type: 'feathered', content: data.mergedContent });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFeathering(null);
    }
  }

  async function handleCompleteMerge() {
    setMerging(true);
    setError(null);
    try {
      // Build resolutions map: slug → resolved content
      const resolvedMap: Record<string, string> = {};
      for (const conflict of conflicts) {
        const r = resolutions[conflict.name];
        if (!r) continue;
        if (r.type === 'head') resolvedMap[conflict.name] = conflict.headContent;
        else if (r.type === 'main') resolvedMap[conflict.name] = conflict.mainContent;
        else resolvedMap[conflict.name] = r.content;
      }
      const res = await fetch(`/api/prs/${prId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutions: resolvedMap }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMerging(false);
    }
  }

  function toggleExpanded(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto py-8 px-4">
      <div className="bg-canvas w-full max-w-3xl rounded-xl border border-border shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-fg flex items-center gap-2">
            <GitMerge size={16} className="text-accent-emphasis" />
            Resolve intent conflicts
          </h2>
          <p className="text-sm text-fg-muted mt-1">
            {conflicts.length} file{conflicts.length !== 1 ? 's' : ''} changed on both branches.
            Choose which version to keep, or feather them together with AI.
          </p>
        </div>

        {/* Conflicts */}
        <div className="divide-y divide-border">
          {conflicts.map((conflict) => {
            const r = resolutions[conflict.name];
            const isExpanded = expanded.has(conflict.name);
            const isFeatheringThis = feathering === conflict.name;

            return (
              <div key={conflict.name} className="px-6 py-4">
                {/* File header */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => toggleExpanded(conflict.name)}
                    className="flex items-center gap-2 text-sm font-medium text-fg hover:text-accent-emphasis transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <code className="font-mono">{conflict.name}.md</code>
                  </button>
                  <div className="flex items-center gap-2">
                    {r ? (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 size={12} />
                        {r.type === 'head' ? 'Using yours' : r.type === 'main' ? 'Using main' : 'Feathered'}
                      </span>
                    ) : (
                      <span className="text-xs text-fg-muted">Unresolved</span>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <>
                    {/* Side-by-side versions */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className={`rounded-lg border overflow-hidden ${r?.type === 'main' ? 'border-accent' : 'border-border'}`}>
                        <div className="px-3 py-1.5 bg-canvas-subtle border-b border-border text-xs font-medium text-fg-muted flex items-center justify-between">
                          <span>Main (theirs)</span>
                          <button
                            onClick={() => setResolution(conflict.name, { type: 'main' })}
                            className="text-xs px-2 py-0.5 rounded border border-border hover:border-accent hover:text-accent-emphasis transition-colors"
                          >
                            Use this
                          </button>
                        </div>
                        <pre className="px-3 py-2 text-xs font-mono text-fg-muted overflow-x-auto overflow-y-auto max-h-48 whitespace-pre-wrap bg-canvas-inset leading-relaxed">
                          {conflict.mainContent || '(empty)'}
                        </pre>
                      </div>

                      <div className={`rounded-lg border overflow-hidden ${r?.type === 'head' ? 'border-accent' : 'border-border'}`}>
                        <div className="px-3 py-1.5 bg-canvas-subtle border-b border-border text-xs font-medium text-fg-muted flex items-center justify-between">
                          <span>Yours (incoming)</span>
                          <button
                            onClick={() => setResolution(conflict.name, { type: 'head' })}
                            className="text-xs px-2 py-0.5 rounded border border-border hover:border-accent hover:text-accent-emphasis transition-colors"
                          >
                            Use this
                          </button>
                        </div>
                        <pre className="px-3 py-2 text-xs font-mono text-fg-muted overflow-x-auto overflow-y-auto max-h-48 whitespace-pre-wrap bg-canvas-inset leading-relaxed">
                          {conflict.headContent || '(empty)'}
                        </pre>
                      </div>
                    </div>

                    {/* Feather with AI */}
                    <div className={`rounded-lg border overflow-hidden ${r?.type === 'feathered' ? 'border-accent' : 'border-border'}`}>
                      <div className="px-3 py-1.5 bg-canvas-subtle border-b border-border text-xs font-medium text-fg-muted flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Sparkles size={11} className="text-accent-emphasis" />
                          Feathered (AI-merged)
                        </span>
                        <button
                          onClick={() => handleFeather(conflict)}
                          disabled={isFeatheringThis}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-accent/50 text-accent-emphasis hover:bg-accent/10 disabled:opacity-50 transition-colors"
                        >
                          {isFeatheringThis ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                          {isFeatheringThis ? 'Feathering…' : r?.type === 'feathered' ? 'Re-feather' : 'Feather with AI'}
                        </button>
                      </div>
                      {r?.type === 'feathered' ? (
                        <pre className="px-3 py-2 text-xs font-mono text-fg-muted overflow-x-auto overflow-y-auto max-h-48 whitespace-pre-wrap bg-canvas-inset leading-relaxed">
                          {r.content}
                        </pre>
                      ) : (
                        <div className="px-3 py-3 text-xs text-fg-subtle italic text-center">
                          Click "Feather with AI" to intelligently merge both versions
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {!allResolved && (
              <p className="text-xs text-fg-muted">
                {conflicts.filter((c) => !resolutions[c.name]).length} conflict{conflicts.filter((c) => !resolutions[c.name]).length !== 1 ? 's' : ''} remaining
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              disabled={merging}
              className="text-sm px-4 py-1.5 rounded border border-border text-fg-muted hover:text-fg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCompleteMerge}
              disabled={!allResolved || merging}
              className="flex items-center gap-2 text-sm px-4 py-1.5 rounded bg-accent hover:bg-accent/80 disabled:opacity-40 text-white font-medium transition-colors"
            >
              {merging ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
              {merging ? 'Merging…' : 'Complete merge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
