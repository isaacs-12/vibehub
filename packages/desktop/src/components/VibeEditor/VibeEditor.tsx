import React, { useCallback, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorSelection } from '@codemirror/state';
import ReactMarkdown from 'react-markdown';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Eye,
  Edit3,
  X,
  Plus,
  Link,
  Database,
  ShieldOff,
} from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';
import {
  parseVibeGrammar,
  serializeVibeGrammar,
  toGrammarName,
  fromGrammarName,
  featurePathToGrammarName,
  buildDependencyGraph,
  wouldCreateCycle,
  type VibeGrammar,
} from '../../lib/vibeGrammar.ts';

type ViewMode = 'write' | 'preview';

// ─── Grammar Panel ─────────────────────────────────────────────────────────────

function GrammarPanel({
  content,
  onChange,
}: {
  content: string;
  onChange: (newContent: string) => void;
}) {
  const { features, selectedFeature, selectFeature } = useVibeStore();
  const [addingTo, setAddingTo] = useState<'Uses' | 'Data' | 'Never' | null>(null);
  const [addInput, setAddInput] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  const { grammar, body } = parseVibeGrammar(content);

  // Flat list of all leaf features for autocomplete
  function allLeafFeatures(nodes = features): Array<{ name: string; path: string; content: string }> {
    const out: Array<{ name: string; path: string; content: string }> = [];
    for (const n of nodes) {
      if (n.children?.length) out.push(...allLeafFeatures(n.children));
      else out.push({ name: n.name, path: n.path, content: n.content });
    }
    return out;
  }
  const allFeatures = allLeafFeatures();

  // Build dependency graph, using current editorContent for the selected feature.
  const currentSlug = selectedFeature
    ? selectedFeature.path.replace(/^\.vibe[/\\]features[/\\]/, '').replace(/\.md$/, '')
    : null;
  const depGraph = buildDependencyGraph(
    allFeatures.map((f) => ({
      slug: f.path.replace(/^\.vibe[/\\]features[/\\]/, '').replace(/\.md$/, ''),
      content: currentSlug && f.path === selectedFeature?.path ? content : f.content,
    })),
  );

  function commit(updated: VibeGrammar) {
    onChange(serializeVibeGrammar(updated, body));
  }

  function removeFrom(field: 'Uses' | 'Data' | 'Never', value: string) {
    commit({ ...grammar, [field]: grammar[field].filter((v) => v !== value) });
  }

  function startAdding(field: 'Uses' | 'Data' | 'Never') {
    setAddingTo(field);
    setAddInput('');
    setTimeout(() => addInputRef.current?.focus(), 0);
  }

  function confirmAdd() {
    const val = addInput.trim();
    if (val && addingTo) {
      const existing = grammar[addingTo];
      if (!existing.includes(val)) {
        // Guard against cycles when adding to Uses.
        if (addingTo === 'Uses' && currentSlug) {
          const toSlug = fromGrammarName(val);
          if (wouldCreateCycle(currentSlug, toSlug, depGraph)) return;
        }
        commit({ ...grammar, [addingTo]: [...existing, val] });
      }
    }
    setAddingTo(null);
    setAddInput('');
  }

  function navigateToFeature(grammarName: string) {
    const target = allFeatures.find(
      (f) => featurePathToGrammarName(f.path) === grammarName || toGrammarName(f.name) === grammarName,
    );
    if (target) selectFeature({ name: target.name, path: target.path, content: '' });
  }

  // Autocomplete suggestions filtered by input and cycle safety.
  function suggestions(field: 'Uses' | 'Data'): string[] {
    const q = addInput.toLowerCase();
    return allFeatures
      .map((f) => featurePathToGrammarName(f.path))
      .filter((n) => {
        if (grammar[field].includes(n)) return false;
        if (!n.toLowerCase().includes(q)) return false;
        // Exclude Uses candidates that would create a cycle.
        if (field === 'Uses' && currentSlug) {
          const toSlug = fromGrammarName(n);
          if (wouldCreateCycle(currentSlug, toSlug, depGraph)) return false;
        }
        return true;
      })
      .slice(0, 6);
  }

  const knownGrammarNames = new Set(allFeatures.map((f) => featurePathToGrammarName(f.path)));

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5 px-3 py-2 border-b border-surface-border bg-surface-raised text-xs">
      {/* Uses */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="flex items-center gap-1 text-muted shrink-0">
          <Link size={10} />
          Uses
        </span>
        {grammar.Uses.map((name) => (
          <span
            key={name}
            className={`group flex items-center gap-0.5 px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
              knownGrammarNames.has(name)
                ? 'bg-accent/20 text-accent-light hover:bg-accent/30'
                : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
            }`}
            title={knownGrammarNames.has(name) ? `Go to ${name}` : `Unknown feature: ${name}`}
            onClick={() => navigateToFeature(name)}
          >
            {name}
            <button
              onClick={(e) => { e.stopPropagation(); removeFrom('Uses', name); }}
              className="opacity-0 group-hover:opacity-100 ml-0.5 hover:text-white"
            >
              <X size={9} />
            </button>
          </span>
        ))}
        {addingTo === 'Uses' ? (
          <div className="relative">
            <input
              ref={addInputRef}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAdd();
                if (e.key === 'Escape') { setAddingTo(null); setAddInput(''); }
              }}
              onBlur={() => setTimeout(() => { setAddingTo(null); setAddInput(''); }, 150)}
              placeholder="FeatureName"
              className="w-28 bg-surface border border-accent/50 rounded px-1.5 py-0.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
            />
            {suggestions('Uses').length > 0 && (
              <div className="absolute top-full left-0 mt-0.5 bg-surface-overlay border border-surface-border rounded shadow-lg z-20 min-w-max">
                {suggestions('Uses').map((s) => (
                  <button
                    key={s}
                    onMouseDown={() => { commit({ ...grammar, Uses: [...grammar.Uses, s] }); setAddingTo(null); setAddInput(''); }}
                    className="block w-full text-left px-2 py-1 text-xs text-gray-200 hover:bg-accent/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => startAdding('Uses')}
            className="text-muted hover:text-gray-300 transition-colors"
            title="Add dependency"
          >
            <Plus size={11} />
          </button>
        )}
      </div>

      {/* Data */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="flex items-center gap-1 text-muted shrink-0">
          <Database size={10} />
          Data
        </span>
        {grammar.Data.map((name) => (
          <span
            key={name}
            className="group flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
          >
            {name}
            <button
              onClick={() => removeFrom('Data', name)}
              className="opacity-0 group-hover:opacity-100 ml-0.5 hover:text-white"
            >
              <X size={9} />
            </button>
          </span>
        ))}
        {addingTo === 'Data' ? (
          <div className="relative">
            <input
              ref={addingTo === 'Data' ? addInputRef : undefined}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAdd();
                if (e.key === 'Escape') { setAddingTo(null); setAddInput(''); }
              }}
              onBlur={() => setTimeout(() => { setAddingTo(null); setAddInput(''); }, 150)}
              placeholder="EntityName"
              className="w-24 bg-surface border border-accent/50 rounded px-1.5 py-0.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
            />
            {suggestions('Data').length > 0 && (
              <div className="absolute top-full left-0 mt-0.5 bg-surface-overlay border border-surface-border rounded shadow-lg z-20 min-w-max">
                {suggestions('Data').map((s) => (
                  <button
                    key={s}
                    onMouseDown={() => { commit({ ...grammar, Data: [...grammar.Data, s] }); setAddingTo(null); setAddInput(''); }}
                    className="block w-full text-left px-2 py-1 text-xs text-gray-200 hover:bg-accent/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => startAdding('Data')}
            className="text-muted hover:text-gray-300 transition-colors"
            title="Add data entity"
          >
            <Plus size={11} />
          </button>
        )}
      </div>

      {/* Never */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="flex items-center gap-1 text-muted shrink-0">
          <ShieldOff size={10} />
          Never
        </span>
        {grammar.Never.map((item) => (
          <span
            key={item}
            className="group flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 transition-colors"
            title={item}
          >
            <span className="max-w-[140px] truncate">{item}</span>
            <button
              onClick={() => removeFrom('Never', item)}
              className="opacity-0 group-hover:opacity-100 ml-0.5 hover:text-white shrink-0"
            >
              <X size={9} />
            </button>
          </span>
        ))}
        {addingTo === 'Never' ? (
          <input
            ref={addingTo === 'Never' ? addInputRef : undefined}
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmAdd();
              if (e.key === 'Escape') { setAddingTo(null); setAddInput(''); }
            }}
            onBlur={() => setTimeout(() => { setAddingTo(null); setAddInput(''); }, 150)}
            placeholder="Constraint description"
            className="w-44 bg-surface border border-accent/50 rounded px-1.5 py-0.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
          />
        ) : (
          <button
            onClick={() => startAdding('Never')}
            className="text-muted hover:text-gray-300 transition-colors"
            title="Add constraint"
          >
            <Plus size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Editor ────────────────────────────────────────────────────────────────────

export default function VibeEditor() {
  const { selectedFeature, editorContent, updateEditorContent, saveFeature, isDirty } = useVibeStore();
  const editorRef = useRef<{ view?: import('@codemirror/view').EditorView } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('write');

  const handleChange = useCallback(
    (value: string) => updateEditorContent(value),
    [updateEditorContent],
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        await saveFeature();
      }
    },
    [saveFeature],
  );

  const wrapOrInsert = useCallback((before: string, after: string, blockPrefix = '') => {
    const view = editorRef.current?.view;
    if (!view) {
      updateEditorContent(editorContent + blockPrefix + before + 'text' + after + '\n');
      return;
    }
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const isBlock = blockPrefix !== '';
    if (selected) {
      const newText = isBlock ? `${blockPrefix}${selected}` : `${before}${selected}${after}`;
      view.dispatch({ changes: { from, to, insert: newText } });
    } else {
      const insert = isBlock ? blockPrefix : before + after;
      const newFrom = from + (isBlock ? blockPrefix.length : before.length);
      view.dispatch({
        changes: { from, to: from, insert },
        selection: EditorSelection.cursor(newFrom),
      });
    }
    updateEditorContent(view.state.doc.toString());
  }, [editorContent, updateEditorContent]);

  const toolbar = (
    <div className="flex items-center gap-0.5 border-b border-surface-border bg-surface-raised px-2 py-1">
      <button
        type="button"
        onClick={() => wrapOrInsert('**', '**')}
        className="p-1.5 rounded text-muted hover:bg-surface hover:text-gray-200"
        title="Bold"
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        onClick={() => wrapOrInsert('*', '*')}
        className="p-1.5 rounded text-muted hover:bg-surface hover:text-gray-200"
        title="Italic"
      >
        <Italic size={14} />
      </button>
      <span className="w-px h-4 bg-surface-border mx-0.5" />
      <button
        type="button"
        onClick={() => wrapOrInsert('', '', '# ')}
        className="p-1.5 rounded text-muted hover:bg-surface hover:text-gray-200"
        title="Heading 1"
      >
        <Heading1 size={14} />
      </button>
      <button
        type="button"
        onClick={() => wrapOrInsert('', '', '## ')}
        className="p-1.5 rounded text-muted hover:bg-surface hover:text-gray-200"
        title="Heading 2"
      >
        <Heading2 size={14} />
      </button>
      <button
        type="button"
        onClick={() => wrapOrInsert('', '', '### ')}
        className="p-1.5 rounded text-muted hover:bg-surface hover:text-gray-200"
        title="Heading 3"
      >
        <Heading3 size={14} />
      </button>
      <span className="w-px h-4 bg-surface-border mx-0.5" />
      <button
        type="button"
        onClick={() => wrapOrInsert('', '', '- ')}
        className="p-1.5 rounded text-muted hover:bg-surface hover:text-gray-200"
        title="Bullet list"
      >
        <List size={14} />
      </button>
      <button
        type="button"
        onClick={() => wrapOrInsert('', '', '1. ')}
        className="p-1.5 rounded text-muted hover:bg-surface hover:text-gray-200"
        title="Numbered list"
      >
        <ListOrdered size={14} />
      </button>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setViewMode((m) => (m === 'write' ? 'preview' : 'write'))}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${viewMode === 'preview' ? 'bg-accent/20 text-accent-light' : 'text-muted hover:bg-surface hover:text-gray-200'}`}
        title={viewMode === 'write' ? 'Show preview' : 'Show editor'}
      >
        {viewMode === 'write' ? <Eye size={12} /> : <Edit3 size={12} />}
        {viewMode === 'write' ? 'Preview' : 'Write'}
      </button>
    </div>
  );

  if (!selectedFeature) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 bg-surface">
        <div className="text-6xl opacity-20">◈</div>
        <p className="text-muted text-sm">Select a feature from the sidebar to start editing its Vibe.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface" onKeyDown={handleKeyDown}>
      {/* Tab bar */}
      <div className="flex items-center px-3 border-b border-surface-border bg-surface-raised h-9 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1 text-xs bg-surface rounded-t border border-b-0 border-surface-border text-gray-200">
          <span>{selectedFeature.name}.md</span>
          {isDirty && <span className="text-accent-light text-[10px]">●</span>}
        </div>
      </div>

      {/* Grammar panel */}
      <GrammarPanel content={editorContent} onChange={updateEditorContent} />

      {/* Toolbar */}
      {toolbar}

      {/* Editor or Preview */}
      <div className="flex-1 overflow-hidden min-h-0">
        {viewMode === 'write' ? (
          <CodeMirror
            ref={editorRef}
            value={editorContent}
            height="100%"
            extensions={[markdown({ base: markdownLanguage })]}
            theme={oneDark}
            onChange={handleChange}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: true,
            }}
            className="h-full text-sm"
          />
        ) : (
          <div className="h-full overflow-y-auto p-4 text-sm text-fg prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-medium mt-2 mb-1">{children}</h3>,
                p: ({ children }) => <p className="my-2">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 my-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 my-2">{children}</ol>,
                li: ({ children }) => <li className="my-0.5">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
              }}
            >
              {parseVibeGrammar(editorContent).body || '*Nothing yet. Switch to Write to edit.*'}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end px-3 py-1 border-t border-surface-border bg-surface-raised text-xs text-muted">
        {isDirty ? (
          <span className="text-amber-400">Unsaved — ⌘S to save</span>
        ) : (
          <span>Saved</span>
        )}
      </div>
    </div>
  );
}
