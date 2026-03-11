import React, { useEffect } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import TopBar from './components/TopBar/TopBar.tsx';
import FeatureSidebar from './components/FeatureSidebar/FeatureSidebar.tsx';
import VibeEditor from './components/VibeEditor/VibeEditor.tsx';
import CodePeek from './components/CodePeek/CodePeek.tsx';
import ChatSidebar from './components/ChatSidebar/ChatSidebar.tsx';
import StatusBar from './components/StatusBar/StatusBar.tsx';
import { useVibeStore } from './store/index.ts';
import { useVibeProject } from './hooks/useVibeProject.ts';

export default function App() {
  const { codePeekVisible, chatOpen } = useVibeStore();
  const { openProject } = useVibeProject();

  // On mount, try to load from last session or prompt user
  useEffect(() => {
    const last = localStorage.getItem('lastProjectRoot');
    if (last) openProject(last);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-surface text-gray-100 select-none">
      <TopBar />
      <div className="flex flex-1 overflow-hidden relative">
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Feature Sidebar */}
          <Panel defaultSize={18} minSize={12} maxSize={35} className="bg-surface-raised border-r border-surface-border">
            <FeatureSidebar />
          </Panel>
          <PanelResizeHandle className="w-1 bg-surface-border hover:bg-accent transition-colors cursor-col-resize" />

          {/* Vibe Editor */}
          <Panel defaultSize={codePeekVisible ? 52 : 82} minSize={30}>
            <VibeEditor />
          </Panel>

          {/* Code Peek */}
          {codePeekVisible && (
            <>
              <PanelResizeHandle className="w-1 bg-surface-border hover:bg-accent transition-colors cursor-col-resize" />
              <Panel defaultSize={30} minSize={15} maxSize={50} className="bg-surface-raised border-l border-surface-border">
                <CodePeek />
              </Panel>
            </>
          )}
        </PanelGroup>

        {/* Chat Sidebar overlay */}
        {chatOpen && (
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-surface-overlay border-l border-surface-border shadow-2xl z-50">
            <ChatSidebar />
          </div>
        )}
      </div>
      <StatusBar />
    </div>
  );
}
