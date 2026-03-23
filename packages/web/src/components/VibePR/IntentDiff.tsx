'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FilePlus2, FileEdit, FileX2, Eye, Code2, Loader2,
  Plus, Minus, PenLine, ChevronDown, ChevronRight,
} from 'lucide-react';
import DiffView from './DiffView';
import type { IntentDiffResult, FileIntentDiff, IntentDelta } from '@/lib/intent-diff';

interface VibeFile {
  path: string;
  content: string;
}

interface IntentDiffProps {
  prId: string;
  baseFeatures: VibeFile[];
  headFeatures: VibeFile[];
  /** Pre-loaded semantic diff from server (avoids flash if already cached) */
  cachedSemanticDiff?: IntentDiffResult | null;
}

type ViewMode = 'intent' | 'content';

// ─── Semantic intent view ────────────────────────────────────────────────────

const DELTA_ICON = {
  added:    { icon: Plus,    color: 'text-green-400', bg: 'bg-green-500/10', label: 'New' },
  removed:  { icon: Minus,   color: 'text-red-400',   bg: 'bg-red-500/10',   label: 'Removed' },
  modified: { icon: PenLine, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Changed' },
} as const;

function DeltaRow({ delta }: { delta: IntentDelta }) {
  const meta = DELTA_ICON[delta.kind];
  const Icon = meta.icon;

  return (
    <div className={`flex items-start gap-3 px-3 py-2 rounded-lg ${meta.bg}`}>
      <div className={`mt-0.5 ${meta.color}`}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-fg">{delta.summary}</span>
      </div>
      <span className={`text-xs ${meta.color} shrink-0`}>{meta.label}</span>
    </div>
  );
}

const FILE_STATUS_META = {
  added:    { icon: FilePlus2, color: 'text-green-400', label: 'New file' },
  removed:  { icon: FileX2,   color: 'text-red-400',   label: 'Removed' },
  modified: { icon: FileEdit,  color: 'text-yellow-400', label: 'Modified' },
} as const;

function SemanticFileBlock({ file }: { file: FileIntentDiff }) {
  const [expanded, setExpanded] = useState(true);
  const meta = FILE_STATUS_META[file.status];
  const Icon = meta.icon;
  // For new/removed files, show all deltas (they're direct extractions).
  // For modified files, filter by confidence to avoid surfacing rewording noise.
  const visibleDeltas = file.status === 'modified'
    ? file.deltas.filter((d) => d.confidence >= 0.7)
    : file.deltas;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-canvas-subtle hover:bg-canvas-subtle/80 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={13} className="text-fg-muted" /> : <ChevronRight size={13} className="text-fg-muted" />}
        <Icon size={13} className={meta.color} />
        <span className="font-mono text-xs text-fg">{file.path}</span>
        <span className={`text-xs ${meta.color}`}>{meta.label}</span>
        {visibleDeltas.length > 0 && (
          <span className="ml-auto text-xs text-fg-muted">
            {visibleDeltas.length} intent change{visibleDeltas.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-1.5">
          {file.status === 'added' && file.deltas.length === 0 && (
            <div className="text-sm text-fg-muted px-3 py-2">
              New feature specification added.
            </div>
          )}
          {file.status === 'removed' && file.deltas.length === 0 && (
            <div className="text-sm text-fg-muted px-3 py-2">
              Feature specification removed.
            </div>
          )}
          {visibleDeltas.map((delta, i) => (
            <DeltaRow key={i} delta={delta} />
          ))}
        </div>
      )}
    </div>
  );
}

function SemanticView({
  result,
  loading,
  error,
}: {
  result: IntentDiffResult | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-fg-muted">
        <Loader2 size={16} className="animate-spin" />
        Analyzing intent changes…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-border rounded-lg px-4 py-4 text-sm">
        <p className="text-red-400">Failed to compute intent diff: {error}</p>
        <p className="text-xs text-fg-muted mt-1">Switch to &ldquo;Content diff&rdquo; to see raw changes.</p>
      </div>
    );
  }

  if (!result || result.files.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-6 text-sm text-fg-muted text-center">
          No meaningful intent changes detected — only rewording or formatting.
        </div>
      </div>
    );
  }

  const totalDeltas = result.files.reduce(
    (sum, f) => sum + (f.status === 'modified'
      ? f.deltas.filter((d) => d.confidence >= 0.7).length
      : f.deltas.length),
    0,
  );

  return (
    <div className="space-y-3">
      <div className="text-xs text-fg-muted">
        {result.files.length} file{result.files.length !== 1 ? 's' : ''} with intent changes
        {totalDeltas > 0 && <> — {totalDeltas} delta{totalDeltas !== 1 ? 's' : ''}</>}
      </div>
      {result.files.map((file) => (
        <SemanticFileBlock key={file.slug} file={file} />
      ))}
    </div>
  );
}

// ─── Content (raw text) diff view ────────────────────────────────────────────

function slug(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

type FileChange =
  | { kind: 'added'; path: string; content: string }
  | { kind: 'modified'; path: string; oldContent: string; newContent: string }
  | { kind: 'removed'; path: string; oldContent: string };

function computeChanges(base: VibeFile[], head: VibeFile[]): FileChange[] {
  const baseMap = new Map(base.map((f) => [slug(f.path), f]));
  const headMap = new Map(head.map((f) => [slug(f.path), f]));
  const changes: FileChange[] = [];
  for (const [s, headFile] of headMap) {
    const baseFile = baseMap.get(s);
    if (!baseFile) changes.push({ kind: 'added', path: headFile.path, content: headFile.content });
    else if (baseFile.content !== headFile.content) changes.push({ kind: 'modified', path: headFile.path, oldContent: baseFile.content, newContent: headFile.content });
  }
  for (const [s, baseFile] of baseMap) {
    if (!headMap.has(s)) changes.push({ kind: 'removed', path: baseFile.path, oldContent: baseFile.content });
  }
  return changes;
}

const KIND_META = {
  added:    { icon: FilePlus2, label: 'Added',    color: 'text-green-400' },
  modified: { icon: FileEdit,  label: 'Modified', color: 'text-yellow-400' },
  removed:  { icon: FileX2,    label: 'Removed',  color: 'text-red-400' },
} as const;

function ContentView({ baseFeatures, headFeatures }: { baseFeatures: VibeFile[]; headFeatures: VibeFile[] }) {
  const changes = computeChanges(baseFeatures, headFeatures);
  if (changes.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-6 text-sm text-fg-muted text-center">
          No text differences — files are identical.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {changes.map((change) => {
        const meta = KIND_META[change.kind];
        const Icon = meta.icon;
        return (
          <div key={change.path} className="space-y-0">
            <div className="flex items-center gap-2 px-1 pb-1.5 text-sm">
              <Icon size={13} className={meta.color} />
              <span className="font-mono text-fg text-xs">{change.path}</span>
              <span className={`text-xs ${meta.color}`}>{meta.label}</span>
            </div>
            {change.kind === 'added' && <DiffView oldText="" newText={change.content} oldLabel="(new file)" newLabel="added" />}
            {change.kind === 'modified' && <DiffView oldText={change.oldContent} newText={change.newContent} oldLabel="main" newLabel="branch" />}
            {change.kind === 'removed' && <DiffView oldText={change.oldContent} newText="" oldLabel="main" newLabel="(removed)" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function IntentDiff({ prId, baseFeatures, headFeatures, cachedSemanticDiff }: IntentDiffProps) {
  const [mode, setMode] = useState<ViewMode>('intent');
  const [semanticResult, setSemanticResult] = useState<IntentDiffResult | null>(cachedSemanticDiff ?? null);
  const [loading, setLoading] = useState(!cachedSemanticDiff);
  const [error, setError] = useState<string | null>(null);

  const fetchIntentDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prs/${prId}/intent-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSemanticResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [prId]);

  useEffect(() => {
    if (!cachedSemanticDiff && headFeatures.length > 0) {
      fetchIntentDiff();
    }
  }, [cachedSemanticDiff, headFeatures.length, fetchIntentDiff]);

  if (headFeatures.length === 0 && baseFeatures.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-6 text-sm text-fg-muted text-center">
          No vibe file content for this branch. Push from Vibe Studio with the Push button to upload branch state.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* View mode toggle */}
      <div className="flex items-center gap-1 p-0.5 bg-canvas-subtle rounded-lg w-fit border border-border">
        <button
          onClick={() => setMode('intent')}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
            mode === 'intent'
              ? 'bg-canvas text-fg font-medium shadow-sm'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          <Eye size={12} />
          Intent changes
        </button>
        <button
          onClick={() => setMode('content')}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
            mode === 'content'
              ? 'bg-canvas text-fg font-medium shadow-sm'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          <Code2 size={12} />
          Content diff
        </button>
      </div>

      {/* View */}
      {mode === 'intent' ? (
        <SemanticView
          result={semanticResult}
          loading={loading}
          error={error}
        />
      ) : (
        <ContentView baseFeatures={baseFeatures} headFeatures={headFeatures} />
      )}
    </div>
  );
}
