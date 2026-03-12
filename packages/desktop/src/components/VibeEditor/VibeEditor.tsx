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
} from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';

type ViewMode = 'write' | 'preview';

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
              {editorContent || '*Nothing yet. Switch to Write to edit.*'}
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
