import React, { useState, useRef, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useVibeStore, type FeatureNode } from '../../store/index.ts';

export default function FeatureSidebar() {
  const { features, selectedFeature, selectFeature, projectRoot } = useVibeStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function commitNewFeature() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setAdding(false);
    setNewName('');
    if (!name || !projectRoot) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_vibe_file', {
      root: projectRoot,
      relativePath: `.vibe/features/${name}.md`,
      content: `# ${name}\n\n## Overview\n\n## Goals\n\n## Non-Goals\n`,
    });
    const raw = await invoke<Array<{ name: string; path: string; content: string }>>('list_vibe_features', { root: projectRoot });
    useVibeStore.setState({
      features: raw.map((f) => ({ name: f.name, path: f.path, content: f.content })),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitNewFeature();
    if (e.key === 'Escape') { setAdding(false); setNewName(''); }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">Features</span>
        <button
          onClick={() => projectRoot && setAdding(true)}
          className="text-muted hover:text-gray-200 transition-colors"
          title="New feature"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* New feature inline input */}
      {adding && (
        <div className="px-2 py-1.5 border-b border-surface-border">
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitNewFeature}
            placeholder="feature-name"
            className="w-full bg-surface border border-accent/50 rounded px-2 py-1 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
          />
          <p className="text-[10px] text-muted mt-1">Enter to confirm · Esc to cancel</p>
        </div>
      )}

      {/* Feature Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {!projectRoot ? (
          <div className="px-4 py-3 text-xs text-muted">
            No project open. Use <strong className="text-gray-300">Open Project</strong> in the top bar to open a folder with a <code className="font-mono">.vibe/</code> directory (or run <code className="font-mono">vibe init</code> in a repo first).
          </div>
        ) : features.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted italic">
            No features yet. Click + to add one, or run <code className="font-mono">vibe init</code>.
          </div>
        ) : (
          features.map((feature) => (
            <FeatureTreeItem
              key={feature.path}
              feature={feature}
              depth={0}
              selected={selectedFeature?.path === feature.path}
              expanded={expanded}
              onToggle={(path) =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  next.has(path) ? next.delete(path) : next.add(path);
                  return next;
                })
              }
              onSelect={selectFeature}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FeatureTreeItem({
  feature,
  depth,
  selected,
  expanded,
  onToggle,
  onSelect,
}: {
  feature: FeatureNode;
  depth: number;
  selected: boolean;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (f: FeatureNode) => void;
}) {
  const hasChildren = feature.children && feature.children.length > 0;
  const isExpanded = expanded.has(feature.path);

  return (
    <>
      <button
        onClick={() => (hasChildren ? onToggle(feature.path) : onSelect(feature))}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs text-left transition-colors rounded-sm mx-1 ${
          selected
            ? 'bg-accent/20 text-accent-light'
            : 'text-gray-300 hover:bg-surface-overlay hover:text-gray-100'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {hasChildren ? (
          isExpanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />
        ) : (
          <FileText size={12} className="shrink-0 text-muted" />
        )}
        <span className="truncate">{feature.name}</span>
      </button>
      {hasChildren && isExpanded &&
        feature.children!.map((child) => (
          <FeatureTreeItem
            key={child.path}
            feature={child}
            depth={depth + 1}
            selected={selected}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}
