import React, { useEffect } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import TopBar from './components/TopBar/TopBar.tsx';
import FeatureSidebar from './components/FeatureSidebar/FeatureSidebar.tsx';
import VibeEditor from './components/VibeEditor/VibeEditor.tsx';
import CodePeek from './components/CodePeek/CodePeek.tsx';
import ChatSidebar from './components/ChatSidebar/ChatSidebar.tsx';
import OutputPanel from './components/OutputPanel/OutputPanel.tsx';
import StatusBar from './components/StatusBar/StatusBar.tsx';
import { useVibeStore } from './store/index.ts';
import { useVibeProject } from './hooks/useVibeProject.ts';

export default function App() {
  const { codePeekVisible, chatOpen, runOutputVisible, appendRunOutput, setRunInProgress } = useVibeStore();
  const { openProject } = useVibeProject();

  // On mount, try to load from last session or prompt user
  useEffect(() => {
    const last = localStorage.getItem('lastProjectRoot');
    if (last) openProject(last);
  }, []);

  // Subscribe to run output and run-ended (always mounted so we capture output when panel is collapsed)
  useEffect(() => {
    let unlistenOutput: (() => void) | null = null;
    let unlistenEnded: (() => void) | null = null;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ line: string; stderr?: boolean }>('run-output', (e) => {
        const { line, stderr: isStderr } = e.payload;
        // Dedupe: npm often echoes "> script" on both stdout and stderr; skip if same as last line.
        const store = useVibeStore.getState();
        const last = store.runOutputLines[store.runOutputLines.length - 1];
        if (last && last.line === line && last.stderr === isStderr) return;
        appendRunOutput(line, isStderr);
      }).then((fn) => {
        unlistenOutput = fn;
      });
      listen('run-ended', () => {
        setRunInProgress(false);
      }).then((fn) => {
        unlistenEnded = fn;
      });
    });
    return () => {
      unlistenOutput?.();
      unlistenEnded?.();
    };
  }, [appendRunOutput, setRunInProgress]);

  const { setRunOutputVisible } = useVibeStore();

  return (
    <div className="flex flex-col h-screen bg-surface text-gray-100">
      <TopBar />
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        <PanelGroup direction="vertical" className="flex-1">
          <Panel defaultSize={runOutputVisible ? 75 : 100} minSize={30}>
            <PanelGroup direction="horizontal" className="h-full">
              <Panel defaultSize={18} minSize={12} maxSize={35} className="bg-surface-raised border-r border-surface-border">
                <FeatureSidebar />
              </Panel>
              <PanelResizeHandle className="w-1 bg-surface-border hover:bg-accent transition-colors cursor-col-resize" />
              <Panel defaultSize={codePeekVisible ? 52 : 82} minSize={30}>
                <VibeEditor />
              </Panel>
              {codePeekVisible && (
                <>
                  <PanelResizeHandle className="w-1 bg-surface-border hover:bg-accent transition-colors cursor-col-resize" />
                  <Panel defaultSize={30} minSize={15} maxSize={50} className="bg-surface-raised border-l border-surface-border">
                    <CodePeek />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
          {runOutputVisible ? (
            <>
              <PanelResizeHandle className="h-1 bg-surface-border hover:bg-accent transition-colors cursor-row-resize" />
              <Panel defaultSize={25} minSize={12} maxSize={60} className="min-h-0">
                <OutputPanel />
              </Panel>
            </>
          ) : (
            <div className="border-t border-surface-border bg-surface-raised shrink-0">
              <button
                type="button"
                onClick={() => setRunOutputVisible(true)}
                className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-widest text-muted hover:text-gray-200 hover:bg-surface"
              >
                <span className="opacity-70">▾</span> Output
              </button>
            </div>
          )}
        </PanelGroup>

        {chatOpen && (
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-surface-overlay border-l border-surface-border shadow-2xl z-50 select-text">
            <ChatSidebar />
          </div>
        )}
      </div>
      <StatusBar />
    </div>
  );
}
