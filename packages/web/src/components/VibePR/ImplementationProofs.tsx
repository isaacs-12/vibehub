'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface Props {
  implementationProofs: { path: string; content: string }[];
}

export default function ImplementationProofs({ implementationProofs }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (implementationProofs.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-6 text-sm text-fg-muted text-center">
          Implementation proofs (generated code for this PR) are not yet available. Run Vibe compile in the desktop app, then push again to include generated code.
        </div>
      </div>
    );
  }

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {implementationProofs.map(({ path, content }) => {
        const isExpanded = expanded.has(path);
        const lineCount = content.split(/\n/).length;
        return (
          <div key={path} className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggle(path)}
              className="w-full flex items-center gap-2 px-4 py-2 bg-canvas-subtle hover:bg-canvas-inset transition-colors text-left"
            >
              <ChevronRight
                size={12}
                className={`text-fg-muted transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
              />
              <span className="font-mono text-sm text-fg truncate">{path}</span>
              <span className="text-xs text-fg-muted ml-auto shrink-0">
                {lineCount} line{lineCount !== 1 ? 's' : ''}
              </span>
            </button>
            {isExpanded && (
              <pre className="px-4 py-3 text-xs font-mono text-fg-muted overflow-x-auto overflow-y-auto max-h-96 leading-relaxed bg-canvas-inset whitespace-pre-wrap">
                {content}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
