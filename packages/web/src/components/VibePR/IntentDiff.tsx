import React from 'react';

const DEMO_DIFF = {
  file: 'features/authentication.md',
  hunks: [
    {
      header: '@@ Authentication Provider @@',
      lines: [
        { type: 'context', text: '## Authentication Strategy' },
        { type: 'context', text: '' },
        { type: 'removed', text: 'Users authenticate via email/password using bcrypt.' },
        { type: 'removed', text: 'Password reset is handled via email link.' },
        { type: 'added', text: 'Users authenticate via email/password **or Google OAuth2**.' },
        { type: 'added', text: 'SSO via Google is the preferred login method.' },
        { type: 'added', text: 'Password reset remains available as fallback.' },
        { type: 'context', text: '' },
        { type: 'context', text: '## Security Requirements' },
      ],
    },
  ],
};

export default function IntentDiff() {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2 bg-canvas-subtle border-b border-border text-sm">
        <span className="font-mono text-fg">{DEMO_DIFF.file}</span>
        <span className="text-xs text-fg-muted">
          <span className="text-success">+3</span> / <span className="text-danger">-2</span> decisions
        </span>
      </div>

      {/* Diff hunks */}
      {DEMO_DIFF.hunks.map((hunk, i) => (
        <div key={i}>
          <div className="px-4 py-1 bg-accent-subtle/30 text-xs font-mono text-accent-emphasis">
            {hunk.header}
          </div>
          {hunk.lines.map((line, j) => (
            <div
              key={j}
              className={`flex text-sm font-mono px-4 py-0.5 ${
                line.type === 'added'
                  ? 'bg-success/10 text-success'
                  : line.type === 'removed'
                  ? 'bg-danger/10 text-danger line-through opacity-70'
                  : 'text-fg-muted'
              }`}
            >
              <span className="w-4 shrink-0 text-fg-subtle select-none">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span>{line.text || '\u00A0'}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
