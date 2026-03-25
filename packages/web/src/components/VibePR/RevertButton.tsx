'use client';

import React, { useState } from 'react';
import { Undo2, Loader2 } from 'lucide-react';

interface Props {
  prId: string;
  owner: string;
  repo: string;
}

export default function RevertButton({ prId, owner, repo }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevert() {
    if (!confirm('Create a revert update? This will propose undoing the changes from this update. You can review it before applying.')) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prs/${prId}/revert`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Navigate to the new revert PR
      window.location.href = `/${owner}/${repo}/pulls/${data.pr.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRevert}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 border border-border text-fg-muted hover:text-fg hover:border-fg-muted"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
        {loading ? 'Creating revert…' : 'Revert'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
