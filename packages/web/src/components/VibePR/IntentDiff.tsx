import React from 'react';

interface IntentDiffProps {
  headFeatures: { path: string; content: string }[];
}

export default function IntentDiff({ headFeatures }: IntentDiffProps) {
  if (headFeatures.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-6 text-sm text-fg-muted text-center">
          No vibe file content for this branch. Push from Vibe Studio with the Push button to upload branch state.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {headFeatures.map(({ path, content }) => (
        <div key={path} className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-canvas-subtle border-b border-border text-sm">
            <span className="font-mono text-fg">{path}</span>
            <span className="text-xs text-fg-muted">
              {content.split(/\n/).length} line{content.split(/\n/).length !== 1 ? 's' : ''}
            </span>
          </div>
          <pre className="px-4 py-3 text-xs font-mono text-fg-muted overflow-x-auto overflow-y-auto max-h-96 leading-relaxed bg-canvas-inset whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      ))}
    </div>
  );
}
