import React, { useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';

export default function OutputPanel() {
  const { runOutputLines, runOutputVisible, setRunOutputVisible } = useVibeStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [runOutputLines]);

  return (
    <div className="flex flex-col h-full border-t border-surface-border bg-surface-raised">
      <button
        type="button"
        onClick={() => setRunOutputVisible(!runOutputVisible)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-widest text-muted hover:text-gray-200 border-b border-surface-border shrink-0"
      >
        <span className="flex items-center gap-1.5">
          <Terminal size={12} />
          Output
        </span>
        {runOutputVisible ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>
      {runOutputVisible && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-auto min-h-0 font-mono text-xs text-gray-300 p-3 whitespace-pre-wrap break-all"
        >
          {runOutputLines.length === 0 ? (
            <span className="text-muted italic">Run the project to see output here.</span>
          ) : (
            runOutputLines.map(({ line, stderr }, i) => (
              <div
                key={i}
                className={stderr ? 'text-amber-400/90' : ''}
              >
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
