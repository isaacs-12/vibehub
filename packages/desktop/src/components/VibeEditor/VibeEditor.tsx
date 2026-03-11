import React, { useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { useVibeStore } from '../../store/index.ts';

export default function VibeEditor() {
  const { selectedFeature, editorContent, updateEditorContent, saveFeature, isDirty } = useVibeStore();

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

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <CodeMirror
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
