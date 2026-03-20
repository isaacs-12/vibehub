import React, { useEffect, useState, useRef } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import TopBar from './components/TopBar/TopBar.tsx';
import FeatureSidebar from './components/FeatureSidebar/FeatureSidebar.tsx';
import VibeEditor from './components/VibeEditor/VibeEditor.tsx';
import CodePeek from './components/CodePeek/CodePeek.tsx';
import ChatSidebar from './components/ChatSidebar/ChatSidebar.tsx';
import OutputPanel from './components/OutputPanel/OutputPanel.tsx';
import StatusBar from './components/StatusBar/StatusBar.tsx';
import ToolsView from './components/ToolsView/ToolsView.tsx';
import AboutDialog from './components/AboutDialog.tsx';
import UpdateCheckDialog from './components/UpdateCheckDialog.tsx';
import { useVibeStore } from './store/index.ts';
import { useVibeProject } from './hooks/useVibeProject.ts';
import { restoreAuth, handleAuthDeepLink } from './lib/auth.ts';

function handleMenuEvent(
  id: string,
  openProject: (root: string) => Promise<void>,
  setAboutOpen: (v: boolean) => void,
  setUpdateCheckOpen: (v: boolean) => void,
) {
  console.log('[menu-event] received:', JSON.stringify(id));
  const store = useVibeStore.getState();
  switch (id) {
    case 'app-about':
      setAboutOpen(true);
      break;
    case 'app-check-updates':
      setUpdateCheckOpen(true);
      break;
    case 'file-new-project':
      store.setNewProjectModalOpen(true);
      break;
    case 'file-open-project':
      import('@tauri-apps/plugin-dialog').then(async ({ open }) => {
        const selected = await open({ directory: true, multiple: false, title: 'Open Vibe Project' });
        if (selected && typeof selected === 'string') {
          await openProject(selected);
          store.setAppMode('editor');
        }
      });
      break;
    case 'file-save':
      if (store.isDirty) store.saveFeature();
      break;
    case 'view-mode-editor':
      store.setAppMode('editor');
      break;
    case 'view-mode-tools':
      store.setAppMode('tools');
      break;
    case 'view-toggle-code-peek':
      store.toggleCodePeek();
      break;
    case 'view-toggle-output':
      store.setRunOutputVisible(!store.runOutputVisible);
      break;
    case 'view-toggle-chat':
      store.setChatOpen(!store.chatOpen);
      break;
  }
}

export default function App() {
  const { codePeekVisible, chatOpen, runOutputVisible, appendRunOutput, setRunInProgress, appMode, newProjectModalOpen } = useVibeStore();
  const { openProject } = useVibeProject();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [updateCheckOpen, setUpdateCheckOpen] = useState(false);

  // On mount, restore auth + load last project
  useEffect(() => {
    restoreAuth();
    const last = localStorage.getItem('lastProjectRoot');
    if (last) openProject(last);
  }, []);

  // Listen for deep-link auth callbacks (vibehub://auth?token=...)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    import('@tauri-apps/plugin-deep-link').then(({ onOpenUrl }) => {
      onOpenUrl((urls) => {
        for (const url of urls) {
          if (url.startsWith('vibehub://auth')) {
            handleAuthDeepLink(url);
          }
        }
      }).then((fn) => { unlisten = fn; });
    }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  // Subscribe to run output, run-ended, and native menu events
  useEffect(() => {
    let unlistenOutput: (() => void) | null = null;
    let unlistenEnded: (() => void) | null = null;
    let unlistenMenu: (() => void) | null = null;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ line: string; stderr?: boolean }>('run-output', (e) => {
        const { line, stderr: isStderr } = e.payload;
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
      listen<string>('menu-event', (e) => {
        handleMenuEvent(e.payload, openProject, setAboutOpen, setUpdateCheckOpen);
      }).then((fn) => {
        unlistenMenu = fn;
      });
    });
    return () => {
      unlistenOutput?.();
      unlistenEnded?.();
      unlistenMenu?.();
    };
  }, [appendRunOutput, setRunInProgress, openProject]);

  const { setRunOutputVisible } = useVibeStore();

  return (
    <div className="flex flex-col h-screen bg-surface text-gray-100">
      <TopBar />
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        {appMode === 'editor' ? (
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
        ) : (
          <ToolsView />
        )}

        {chatOpen && (
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-surface-overlay border-l border-surface-border shadow-2xl z-50 select-text">
            <ChatSidebar />
          </div>
        )}
      </div>
      <StatusBar />
      {newProjectModalOpen && <NewProjectModal openProject={openProject} />}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {updateCheckOpen && <UpdateCheckDialog onClose={() => setUpdateCheckOpen(false)} />}
    </div>
  );
}

function NewProjectModal({ openProject }: { openProject: (root: string) => Promise<void> }) {
  const { setNewProjectModalOpen, setAppMode } = useVibeStore();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Derive folder name from tool name
  const folderName = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'my-tool';

  async function pickLocation() {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const dir = await open({ directory: true, multiple: false, title: 'Choose parent folder' });
    if (dir && typeof dir === 'string') setLocation(dir);
  }

  async function handleCreate() {
    if (!name.trim() || !location) return;
    setCreating(true);
    setError('');
    const projectPath = `${location}/${folderName}`;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('create_new_project', { path: projectPath, name: name.trim() });
      await openProject(projectPath);
      setAppMode('editor');
      setNewProjectModalOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={() => !creating && setNewProjectModalOpen(false)}
    >
      <div
        className="bg-surface-overlay border border-surface-border rounded-lg shadow-xl w-96 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-200 mb-4">New Project</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">Tool name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setNewProjectModalOpen(false);
              }}
              placeholder="e.g. Expense Tracker"
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">Location</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={location}
                readOnly
                placeholder="Choose a folder…"
                className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 placeholder:text-muted cursor-pointer"
                onClick={pickLocation}
              />
              <button
                type="button"
                onClick={pickLocation}
                className="px-3 py-2 text-xs rounded border border-surface-border text-muted hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Browse
              </button>
            </div>
            {location && (
              <p className="text-[10px] text-muted mt-1 font-mono">
                {location}/{folderName}
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={() => !creating && setNewProjectModalOpen(false)}
            className="px-3 py-1.5 text-xs rounded border border-surface-border text-muted hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !name.trim() || !location}
            className="px-4 py-1.5 text-xs rounded bg-accent text-white font-medium disabled:opacity-50 hover:bg-accent/80 transition-colors"
          >
            {creating ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
