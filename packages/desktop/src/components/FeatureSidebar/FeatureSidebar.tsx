import React, { useState, useRef, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, FileText, Trash2, Pencil, Folder } from 'lucide-react';
import { useVibeStore, type FeatureNode } from '../../store/index.ts';

// ─── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(raw: Array<{ name: string; path: string; content: string }>): FeatureNode[] {
  const root: FeatureNode[] = [];
  const folderMap = new Map<string, FeatureNode>();

  for (const entry of raw) {
    // Strip ".vibe/features/" prefix and ".md" suffix to get e.g. "auth/login"
    const rel = entry.path
      .replace(/^\.vibe[/\\]features[/\\]/, '')
      .replace(/\.md$/, '');
    const parts = rel.split(/[/\\]/);

    if (parts.length === 1) {
      root.push({ name: entry.name, path: entry.path, content: entry.content });
    } else {
      let current = root;
      let folderKey = '.vibe/features';
      for (let i = 0; i < parts.length - 1; i++) {
        folderKey += '/' + parts[i];
        let folder = folderMap.get(folderKey);
        if (!folder) {
          folder = { name: parts[i], path: folderKey, content: '', children: [] };
          folderMap.set(folderKey, folder);
          current.push(folder);
        }
        current = folder.children!;
      }
      current.push({ name: entry.name, path: entry.path, content: entry.content });
    }
  }

  return root;
}

async function refreshFeatures(projectRoot: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  const raw = await invoke<Array<{ name: string; path: string; content: string }>>(
    'list_vibe_features',
    { root: projectRoot },
  );
  useVibeStore.setState({ features: buildTree(raw) });
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────

export default function FeatureSidebar() {
  const { features, selectedFeature, selectFeature, projectRoot } = useVibeStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function slugify(name: string) {
    return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-/]/g, '');
  }

  async function commitNewFeature() {
    const slug = slugify(newName);
    setAdding(false);
    setNewName('');
    if (!slug || !projectRoot) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_vibe_file', {
      root: projectRoot,
      relativePath: `.vibe/features/${slug}.md`,
      content: `---\nUses: []\nData: []\nNever: []\n---\n\n# ${slug}\n\n## What it does\nDescribe the feature in plain language. What can a user do, and what happens when they do it?\n\n## Behavior\n- Add specific rules, edge cases, or conditions here\n- Each bullet is something the compiler should implement\n\n## Acceptance criteria\n- How do you know this feature is working correctly?\n`,
    });
    await refreshFeatures(projectRoot);
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
            placeholder="name or folder/name"
            className="w-full bg-surface border border-accent/50 rounded px-2 py-1 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
          />
          <p className="text-[10px] text-muted mt-1">Use / to nest · Enter to confirm · Esc to cancel</p>
        </div>
      )}

      {/* Feature Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {!projectRoot ? (
          <div className="px-4 py-3 text-xs text-muted">
            No project open. Use <strong className="text-gray-300">Open Project</strong> to get started.
          </div>
        ) : features.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted italic">
            No features yet. Click + to add one.
          </div>
        ) : (
          features.map((feature) => (
            <FeatureTreeItem
              key={feature.path}
              feature={feature}
              depth={0}
              selectedPath={selectedFeature?.path ?? null}
              expanded={expanded}
              onToggle={(path) =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  next.has(path) ? next.delete(path) : next.add(path);
                  return next;
                })
              }
              onSelect={selectFeature}
              projectRoot={projectRoot}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Tree item ─────────────────────────────────────────────────────────────────

function FeatureTreeItem({
  feature,
  depth,
  selectedPath,
  expanded,
  onToggle,
  onSelect,
  projectRoot,
}: {
  feature: FeatureNode;
  depth: number;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (f: FeatureNode) => void;
  projectRoot: string;
}) {
  const hasChildren = (feature.children?.length ?? 0) > 0;
  const isExpanded = expanded.has(feature.path);
  const isFolder = hasChildren || feature.content === '';
  const isSelected = selectedPath === feature.path;

  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  function startRename(e: React.MouseEvent) {
    e.stopPropagation();
    setRenameVal(feature.name);
    setRenaming(true);
  }

  async function commitRename() {
    const newName = renameVal.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setRenaming(false);
    if (!newName || newName === feature.name) return;
    const newRelPath = feature.path.replace(/([^/\\]+)\.md$/, `${newName}.md`);
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('rename_vibe_file', {
      root: projectRoot,
      oldPath: feature.path,
      newPath: newRelPath,
    });
    await refreshFeatures(projectRoot);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('delete_vibe_file', { root: projectRoot, relativePath: feature.path });
    const store = useVibeStore.getState();
    if (store.selectedFeature?.path === feature.path) {
      useVibeStore.setState({ selectedFeature: null, editorContent: '', isDirty: false });
    }
    await refreshFeatures(projectRoot);
  }

  if (renaming) {
    return (
      <div className="px-2 py-1" style={{ paddingLeft: `${8 + depth * 12}px` }}>
        <input
          ref={renameRef}
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setRenaming(false);
          }}
          className="w-full bg-surface border border-accent/50 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={`group w-full flex items-center gap-1.5 px-2 py-1 text-xs text-left transition-colors rounded-sm mx-1 cursor-pointer ${
          isSelected
            ? 'bg-accent/20 text-accent-light'
            : 'text-gray-300 hover:bg-surface-overlay hover:text-gray-100'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => (hasChildren ? onToggle(feature.path) : onSelect(feature))}
      >
        {isFolder ? (
          isExpanded
            ? <ChevronDown size={12} className="shrink-0" />
            : <ChevronRight size={12} className="shrink-0" />
        ) : (
          <FileText size={12} className="shrink-0 text-muted" />
        )}
        {isFolder && !hasChildren && <Folder size={12} className="shrink-0 text-muted" />}
        <span className="truncate flex-1">{feature.name}</span>

        {/* Hover actions — only on leaf files */}
        {!isFolder && (
          <span className="hidden group-hover:flex items-center gap-1 ml-1">
            <button
              onClick={startRename}
              className="text-muted hover:text-gray-200 transition-colors"
              title="Rename"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={handleDelete}
              className="text-muted hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          </span>
        )}
      </div>

      {hasChildren && isExpanded &&
        feature.children!.map((child) => (
          <FeatureTreeItem
            key={child.path}
            feature={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
            projectRoot={projectRoot}
          />
        ))}
    </>
  );
}
