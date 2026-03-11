'use client';

import React, { useState } from 'react';
import { MessageSquare, ThumbsUp, AlertTriangle } from 'lucide-react';

const DEMO_COMMENTS = [
  {
    id: '1',
    author: 'carol',
    avatarInitial: 'C',
    time: '1h ago',
    intent: 'The requirement "SSO via Google is the preferred login method" seems prescriptive. Should we say "supported" instead to remain provider-agnostic?',
    reactions: { thumbsUp: 2, warning: 0 },
  },
  {
    id: '2',
    author: 'alice',
    avatarInitial: 'A',
    time: '45m ago',
    intent: 'Good point. Updated the vibe to say "Google OAuth2 is *supported* and recommended for new users".',
    reactions: { thumbsUp: 1, warning: 0 },
  },
];

export default function ReviewThread() {
  const [comment, setComment] = useState('');

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-fg-muted mb-4">
        <MessageSquare size={14} />
        Discussion — comment on the <strong className="text-fg">intent</strong>, not the implementation
      </div>

      <div className="space-y-4 mb-6">
        {DEMO_COMMENTS.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-xs font-bold text-accent-emphasis shrink-0">
              {c.avatarInitial}
            </div>
            <div className="flex-1 bg-canvas-subtle border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="text-sm font-medium text-fg">{c.author}</span>
                <span className="text-xs text-fg-muted">{c.time}</span>
              </div>
              <div className="px-4 py-3 text-sm text-fg">{c.intent}</div>
              <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-xs text-fg-muted">
                <button className="flex items-center gap-1 hover:text-fg transition-colors">
                  <ThumbsUp size={11} /> {c.reactions.thumbsUp}
                </button>
                <button className="flex items-center gap-1 hover:text-attention transition-colors">
                  <AlertTriangle size={11} /> Flag concern
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* New comment */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-border text-xs text-fg-muted bg-canvas-subtle">
          Comment on the intent (feature decision), not the code
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Leave a comment on the intent…"
          rows={3}
          className="w-full bg-canvas-subtle px-4 py-3 text-sm resize-none focus:outline-none placeholder:text-fg-subtle"
        />
        <div className="flex justify-end px-4 py-2 border-t border-border bg-canvas-subtle">
          <button className="px-4 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition-colors disabled:opacity-40" disabled={!comment.trim()}>
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
