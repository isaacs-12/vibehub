'use client';

import React, { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';

interface Props {
  prId: string;
  jobStatus: string | null;
}

export default function RetryCompileButton({ prId, jobStatus }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show retry when the last job failed
  if (jobStatus !== 'failed') return null;

  async function handleRetry() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prs/${prId}/retry`, { method: 'POST' });
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

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleRetry}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-fg-muted hover:text-accent-emphasis hover:border-accent/30 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        {loading ? 'Queuing…' : 'Retry compilation'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
