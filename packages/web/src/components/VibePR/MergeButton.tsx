'use client';

import React, { useState } from 'react';
import { GitMerge, Loader2 } from 'lucide-react';
import ConflictResolver from './ConflictResolver';
import type { MergeConflict } from '@/lib/vibe-merge';

interface Props {
  prId: string;
  headBranch: string;
}

export default function MergeButton({ prId, headBranch }: Props) {
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<MergeConflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMerge() {
    if (!confirm(`Merge "${headBranch}" into main?\n\nThis will accept the vibe changes and enqueue a cloud compile.`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prs/${prId}/merge`, { method: 'POST' });
      if (res.status === 409) {
        const body = await res.json();
        if (Array.isArray(body.conflicts)) {
          // Intent conflicts found — open the resolver
          setConflicts(body.conflicts as MergeConflict[]);
          return;
        }
        throw new Error(body.error ?? 'Conflict');
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (conflicts) {
    return (
      <ConflictResolver
        prId={prId}
        conflicts={conflicts}
        onMerged={() => window.location.reload()}
        onCancel={() => setConflicts(null)}
      />
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleMerge}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
        {loading ? 'Checking…' : 'Merge vibe changes'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
