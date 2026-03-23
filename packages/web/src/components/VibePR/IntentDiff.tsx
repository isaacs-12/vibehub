'use client';

import React from 'react';
import { FilePlus2, FileEdit, FileX2 } from 'lucide-react';
import DiffView from './DiffView';

interface VibeFile {
  path: string;
  content: string;
}

interface IntentDiffProps {
  baseFeatures: VibeFile[];
  headFeatures: VibeFile[];
}

function slug(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

type FileChange =
  | { kind: 'added'; path: string; content: string }
  | { kind: 'modified'; path: string; oldContent: string; newContent: string }
  | { kind: 'removed'; path: string; oldContent: string };

function computeChanges(base: VibeFile[], head: VibeFile[]): FileChange[] {
  const baseMap = new Map(base.map((f) => [slug(f.path), f]));
  const headMap = new Map(head.map((f) => [slug(f.path), f]));
  const changes: FileChange[] = [];

  // Added or modified
  for (const [s, headFile] of headMap) {
    const baseFile = baseMap.get(s);
    if (!baseFile) {
      changes.push({ kind: 'added', path: headFile.path, content: headFile.content });
    } else if (baseFile.content !== headFile.content) {
      changes.push({ kind: 'modified', path: headFile.path, oldContent: baseFile.content, newContent: headFile.content });
    }
  }

  // Removed
  for (const [s, baseFile] of baseMap) {
    if (!headMap.has(s)) {
      changes.push({ kind: 'removed', path: baseFile.path, oldContent: baseFile.content });
    }
  }

  return changes;
}

const KIND_META = {
  added:    { icon: FilePlus2, label: 'Added',    color: 'text-green-400' },
  modified: { icon: FileEdit,  label: 'Modified', color: 'text-yellow-400' },
  removed:  { icon: FileX2,    label: 'Removed',  color: 'text-red-400' },
} as const;

export default function IntentDiff({ baseFeatures, headFeatures }: IntentDiffProps) {
  if (headFeatures.length === 0 && baseFeatures.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-6 text-sm text-fg-muted text-center">
          No vibe file content for this branch. Push from Vibe Studio with the Push button to upload branch state.
        </div>
      </div>
    );
  }

  const changes = computeChanges(baseFeatures, headFeatures);

  if (changes.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-6 text-sm text-fg-muted text-center">
          No differences — branch intent is identical to main.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-fg-muted">
        <span>{changes.length} file{changes.length !== 1 ? 's' : ''} changed</span>
        {changes.filter((c) => c.kind === 'added').length > 0 && (
          <span className="text-green-400">
            {changes.filter((c) => c.kind === 'added').length} added
          </span>
        )}
        {changes.filter((c) => c.kind === 'modified').length > 0 && (
          <span className="text-yellow-400">
            {changes.filter((c) => c.kind === 'modified').length} modified
          </span>
        )}
        {changes.filter((c) => c.kind === 'removed').length > 0 && (
          <span className="text-red-400">
            {changes.filter((c) => c.kind === 'removed').length} removed
          </span>
        )}
      </div>

      {changes.map((change) => {
        const meta = KIND_META[change.kind];
        const Icon = meta.icon;

        return (
          <div key={change.path} className="space-y-0">
            {/* File header */}
            <div className="flex items-center gap-2 px-1 pb-1.5 text-sm">
              <Icon size={13} className={meta.color} />
              <span className="font-mono text-fg text-xs">{change.path}</span>
              <span className={`text-xs ${meta.color}`}>{meta.label}</span>
            </div>

            {/* Diff content */}
            {change.kind === 'added' && (
              <DiffView
                oldText=""
                newText={change.content}
                oldLabel="(new file)"
                newLabel="added"
              />
            )}
            {change.kind === 'modified' && (
              <DiffView
                oldText={change.oldContent}
                newText={change.newContent}
                oldLabel="main"
                newLabel="branch"
              />
            )}
            {change.kind === 'removed' && (
              <DiffView
                oldText={change.oldContent}
                newText=""
                oldLabel="main"
                newLabel="(removed)"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
