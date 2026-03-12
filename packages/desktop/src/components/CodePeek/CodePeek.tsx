import React, { useEffect, useState, useCallback } from 'react';
import { X, Code2, ChevronDown, ChevronRight } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';

export default function CodePeek() {
  const { selectedFeature, codePeekFiles, setCodePeekFiles, toggleCodePeek, projectRoot } = useVibeStore();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedFeature || !projectRoot) {
      setCodePeekFiles([]);
      return;
    }
    loadMappedFiles(selectedFeature.path, projectRoot, setCodePeekFiles);
  }, [selectedFeature, projectRoot]);

  useEffect(() => {
    if (codePeekFiles.length > 0) {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        codePeekFiles.forEach((f) => next.add(f.path));
        return next;
      });
    } else {
      setExpandedPaths(new Set());
    }
  }, [codePeekFiles]);

  const toggleFile = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
          <Code2 size={12} />
          Code Peek
        </div>
        <button onClick={toggleCodePeek} className="text-muted hover:text-gray-200 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {codePeekFiles.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted italic">
            {selectedFeature
              ? 'No code mapped to this feature yet. Update mapping.json.'
              : 'Select a feature to see its mapped code.'}
          </div>
        ) : (
          codePeekFiles.map((f) => {
            const isExpanded = expandedPaths.has(f.path);
            return (
              <div key={f.path} className="border-b border-surface-border">
                <button
                  type="button"
                  onClick={() => toggleFile(f.path)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay text-xs text-muted font-mono text-left hover:bg-surface-raised transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown size={12} className="shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="shrink-0" />
                  )}
                  <span className="truncate">{f.path}</span>
                </button>
                {isExpanded && (
                  <pre className="px-3 py-2 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre leading-relaxed">
                    {f.content.slice(0, 3000)}
                    {f.content.length > 3000 && (
                      <span className="text-muted italic block mt-1">
                        … preview (first 3,000 of {f.content.length.toLocaleString()} characters — full file on disk)
                      </span>
                    )}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

async function loadMappedFiles(
  featurePath: string,
  projectRoot: string,
  setFiles: (files: Array<{ path: string; content: string }>) => void,
) {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const files = await invoke<Array<{ path: string; content: string }>>('get_mapped_code', {
      root: projectRoot,
      featurePath,
    });
    setFiles(files);
  } catch {
    setFiles([]);
  }
}
