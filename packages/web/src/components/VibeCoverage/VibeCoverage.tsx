import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface Props {
  coverage: number;      // 0–100
  totalFiles: number;
  mappedFiles: number;
}

export default function VibeCoverage({ coverage, totalFiles, mappedFiles }: Props) {
  const color =
    coverage >= 80 ? 'bg-success' : coverage >= 50 ? 'bg-attention' : 'bg-danger';
  const textColor =
    coverage >= 80 ? 'text-success' : coverage >= 50 ? 'text-attention' : 'text-danger';

  return (
    <div className="bg-canvas-subtle border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={14} className={textColor} />
        <span className="text-sm font-semibold text-fg">Vibe Coverage</span>
      </div>

      {/* Big number */}
      <div className={`text-4xl font-bold ${textColor} mb-2`}>{coverage}%</div>

      {/* Progress bar */}
      <div className="h-2 bg-canvas-inset rounded-full overflow-hidden mb-3">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${coverage}%` }}
        />
      </div>

      <div className="text-xs text-fg-muted">
        {mappedFiles} of {totalFiles} source files are mapped to a human-readable Vibe.
      </div>

      <div className="mt-3 pt-3 border-t border-border text-xs text-fg-subtle">
        Run <code className="bg-canvas text-accent-emphasis px-1 py-0.5 rounded font-mono">vibe import</code> to increase coverage.
      </div>
    </div>
  );
}
