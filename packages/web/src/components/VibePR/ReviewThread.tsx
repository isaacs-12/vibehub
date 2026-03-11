'use client';

import React, { useState } from 'react';
import { MessageSquare, ThumbsUp, AlertTriangle } from 'lucide-react';
import type { PRComment } from '@/lib/data/store';

interface Props {
  prId: string;
  initialComments: PRComment[];
}

export default function ReviewThread({ prId, initialComments }: Props) {
  const [comments, setComments] = useState<PRComment[]>(initialComments);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!input.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/prs/${prId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim(), author: 'you' }),
      });
      if (res.ok) {
        const comment: PRComment = await res.json();
        setComments((prev) => [...prev, comment]);
        setInput('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-fg-muted mb-4">
        <MessageSquare size={14} />
        Discussion — comment on the <strong className="text-fg">intent</strong>, not the implementation
      </div>

      <div className="space-y-4 mb-6">
        {comments.length === 0 && (
          <p className="text-sm text-fg-muted text-center py-4">No comments yet. Be the first to review the intent.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-xs font-bold text-accent-emphasis shrink-0">
              {c.author[0].toUpperCase()}
            </div>
            <div className="flex-1 bg-canvas-subtle border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="text-sm font-medium text-fg">{c.author}</span>
                <span className="text-xs text-fg-muted">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <div className="px-4 py-3 text-sm text-fg whitespace-pre-wrap">{c.content}</div>
              <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-xs text-fg-muted">
                <button className="flex items-center gap-1 hover:text-fg transition-colors">
                  <ThumbsUp size={11} /> 0
                </button>
                <button className="flex items-center gap-1 hover:text-attention transition-colors">
                  <AlertTriangle size={11} /> Flag concern
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-border text-xs text-fg-muted bg-canvas-subtle">
          Comment on the intent (feature decision), not the code
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleSubmit(); }}
          placeholder="Leave a comment on the intent…"
          rows={3}
          className="w-full bg-canvas-subtle px-4 py-3 text-sm resize-none focus:outline-none placeholder:text-fg-subtle"
        />
        <div className="flex justify-end px-4 py-2 border-t border-border bg-canvas-subtle">
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || submitting}
            className="px-4 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition-colors disabled:opacity-40"
          >
            {submitting ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
