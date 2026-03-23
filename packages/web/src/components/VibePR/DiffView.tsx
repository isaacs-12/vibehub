'use client';

import React from 'react';
import { computeDiff, isIdentical, type DiffLine } from '@/lib/line-diff';

interface DiffViewProps {
  oldText: string;
  newText: string;
  /** Label shown for the old side, e.g. "main" */
  oldLabel?: string;
  /** Label shown for the new side, e.g. "yours" */
  newLabel?: string;
  /** Max height in CSS units. Defaults to "24rem" */
  maxHeight?: string;
}

const LINE_STYLES: Record<DiffLine['type'], { bg: string; marker: string; text: string }> = {
  add:    { bg: 'bg-green-500/10', marker: '+', text: 'text-green-400' },
  remove: { bg: 'bg-red-500/10',   marker: '-', text: 'text-red-400' },
  equal:  { bg: '',                 marker: ' ', text: 'text-fg-muted' },
};

export default function DiffView({
  oldText,
  newText,
  oldLabel = 'base',
  newLabel = 'changed',
  maxHeight = '24rem',
}: DiffViewProps) {
  if (isIdentical(oldText, newText)) {
    return (
      <div className="px-4 py-3 text-xs text-fg-subtle italic text-center bg-canvas-inset rounded-lg border border-border">
        No changes — files are identical
      </div>
    );
  }

  const lines = computeDiff(oldText, newText);
  const adds = lines.filter((l) => l.type === 'add').length;
  const removes = lines.filter((l) => l.type === 'remove').length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-canvas-subtle border-b border-border text-xs text-fg-muted">
        <span>
          <span className="font-mono">{oldLabel}</span>
          {' → '}
          <span className="font-mono">{newLabel}</span>
        </span>
        <span className="flex items-center gap-2">
          {adds > 0 && <span className="text-green-400">+{adds}</span>}
          {removes > 0 && <span className="text-red-400">−{removes}</span>}
        </span>
      </div>

      {/* Diff lines */}
      <div
        className="overflow-x-auto overflow-y-auto bg-canvas-inset font-mono text-xs leading-relaxed"
        style={{ maxHeight }}
      >
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => {
              const s = LINE_STYLES[line.type];
              return (
                <tr key={i} className={s.bg}>
                  {/* Old line number */}
                  <td className="select-none text-right px-2 py-0 text-fg-subtle/40 w-[1%] whitespace-nowrap border-r border-border/30">
                    {line.oldNum ?? ''}
                  </td>
                  {/* New line number */}
                  <td className="select-none text-right px-2 py-0 text-fg-subtle/40 w-[1%] whitespace-nowrap border-r border-border/30">
                    {line.newNum ?? ''}
                  </td>
                  {/* Marker */}
                  <td className={`select-none px-1 py-0 w-[1%] ${s.text}`}>
                    {s.marker}
                  </td>
                  {/* Content */}
                  <td className={`px-2 py-0 whitespace-pre-wrap ${s.text}`}>
                    {line.content}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Side-by-side diff view used in ConflictResolver.
 * Shows two versions with per-line change highlighting.
 */
interface SideBySideDiffProps {
  baseText: string;
  leftText: string;
  rightText: string;
  leftLabel: string;
  rightLabel: string;
  maxHeight?: string;
  selectedSide?: 'left' | 'right' | null;
  onSelectLeft?: () => void;
  onSelectRight?: () => void;
}

export function SideBySideDiff({
  baseText,
  leftText,
  rightText,
  leftLabel,
  rightLabel,
  maxHeight = '12rem',
  selectedSide,
  onSelectLeft,
  onSelectRight,
}: SideBySideDiffProps) {
  const leftDiff = computeDiff(baseText, leftText);
  const rightDiff = computeDiff(baseText, rightText);
  const leftChanges = leftDiff.filter((l) => l.type !== 'equal').length;
  const rightChanges = rightDiff.filter((l) => l.type !== 'equal').length;

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Left (main) */}
      <div className={`rounded-lg border overflow-hidden ${selectedSide === 'left' ? 'border-accent' : 'border-border'}`}>
        <div className="px-3 py-1.5 bg-canvas-subtle border-b border-border text-xs font-medium text-fg-muted flex items-center justify-between">
          <span>
            {leftLabel}
            {leftChanges > 0 && (
              <span className="ml-2 text-fg-subtle">
                {leftChanges} change{leftChanges !== 1 ? 's' : ''} from base
              </span>
            )}
          </span>
          {onSelectLeft && (
            <button
              onClick={onSelectLeft}
              className="text-xs px-2 py-0.5 rounded border border-border hover:border-accent hover:text-accent-emphasis transition-colors"
            >
              Use this
            </button>
          )}
        </div>
        <div
          className="overflow-x-auto overflow-y-auto bg-canvas-inset font-mono text-xs leading-relaxed"
          style={{ maxHeight }}
        >
          <DiffLines lines={leftDiff} />
        </div>
      </div>

      {/* Right (head) */}
      <div className={`rounded-lg border overflow-hidden ${selectedSide === 'right' ? 'border-accent' : 'border-border'}`}>
        <div className="px-3 py-1.5 bg-canvas-subtle border-b border-border text-xs font-medium text-fg-muted flex items-center justify-between">
          <span>
            {rightLabel}
            {rightChanges > 0 && (
              <span className="ml-2 text-fg-subtle">
                {rightChanges} change{rightChanges !== 1 ? 's' : ''} from base
              </span>
            )}
          </span>
          {onSelectRight && (
            <button
              onClick={onSelectRight}
              className="text-xs px-2 py-0.5 rounded border border-border hover:border-accent hover:text-accent-emphasis transition-colors"
            >
              Use this
            </button>
          )}
        </div>
        <div
          className="overflow-x-auto overflow-y-auto bg-canvas-inset font-mono text-xs leading-relaxed"
          style={{ maxHeight }}
        >
          <DiffLines lines={rightDiff} />
        </div>
      </div>
    </div>
  );
}

function DiffLines({ lines }: { lines: DiffLine[] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((line, i) => {
          const s = LINE_STYLES[line.type];
          return (
            <tr key={i} className={s.bg}>
              <td className={`select-none px-1.5 py-0 w-[1%] ${s.text}`}>
                {s.marker}
              </td>
              <td className={`px-2 py-0 whitespace-pre-wrap ${s.text}`}>
                {line.content}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
