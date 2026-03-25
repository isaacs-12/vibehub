'use client';

import React, { useState } from 'react';
import { XCircle, RotateCcw, Loader2 } from 'lucide-react';

interface Props {
  prId: string;
  status: 'open' | 'merged' | 'closed';
}

export default function CloseReopenButton({ prId, status }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'merged') return null;

  const isOpen = status === 'open';
  const action = isOpen ? 'close' : 'reopen';

  async function handleClick() {
    const message = isOpen
      ? 'Close this update? The spec changes will be preserved but not applied.'
      : 'Reopen this update?';
    if (!confirm(message)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prs/${prId}/${action}`, { method: 'POST' });
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
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
          isOpen
            ? 'border border-border text-fg-muted hover:text-red-400 hover:border-red-400/30'
            : 'border border-border text-fg-muted hover:text-success hover:border-success/30'
        }`}
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : isOpen ? (
          <XCircle size={14} />
        ) : (
          <RotateCcw size={14} />
        )}
        {loading ? (isOpen ? 'Closing…' : 'Reopening…') : isOpen ? 'Close update' : 'Reopen update'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
