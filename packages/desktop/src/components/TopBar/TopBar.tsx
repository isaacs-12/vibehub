import React, { useState } from 'react';
import { Zap, MessageSquare, FolderOpen, Loader2, Play, Square, Code2, PenTool, Wrench } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';
import type { AppMode } from '../../store/index.ts';
import { useVibeProject } from '../../hooks/useVibeProject.ts';

export default function TopBar() {
  const {
    setChatOpen, chatOpen, isDirty, selectedFeature, saveFeature,
    projectRoot, setCodePeekFiles, clearRunOutput, setRunOutputVisible,
    codePeekVisible, toggleCodePeek, runInProgress, setRunInProgress,
    appMode, setAppMode,
  } = useVibeStore();
  const { openProject } = useVibeProject();
  const [vibeLoading, setVibeLoading] = useState(false);

  async function handleOpenProject() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Open Vibe Project' });
      if (selected && typeof selected === 'string') openProject(selected);
    } catch (err) {
      console.error('Open Project failed:', err);
      alert(`Could not open folder picker: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleRun() {
    if (!projectRoot) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Open a project first.', { title: 'Run', kind: 'info' });
      return;
    }
    clearRunOutput();
    setRunOutputVisible(true);
    setRunInProgress(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('run_project', { root: projectRoot });
    } catch (err) {
      setRunInProgress(false);
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Run', kind: 'error' });
    }
  }

  async function handleStop() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_project');
    } catch {
      // If the process was already gone, just reset the state
    }
    setRunInProgress(false);
  }

  async function handleVibeCompile() {
    if (!projectRoot) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Open a project first.', { title: 'Vibe', kind: 'info' });
      return;
    }
    setVibeLoading(true);
    try {
      await saveFeature();
      const { invoke } = await import('@tauri-apps/api/core');
      const { message } = await import('@tauri-apps/plugin-dialog');
      const result = await invoke<string>('compile_vibes', { root: projectRoot });
      await message(result ?? 'Done.', { title: 'Vibe', kind: 'info' });
      if (selectedFeature?.path) {
        try {
          const files = await invoke<Array<{ path: string; content: string }>>('get_mapped_code', {
            root: projectRoot,
            featurePath: selectedFeature.path,
          });
          setCodePeekFiles(files ?? []);
        } catch {
          setCodePeekFiles([]);
        }
      }
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Vibe', kind: 'error' });
    } finally {
      setVibeLoading(false);
    }
  }

  return (
    <header className="flex items-center justify-between h-10 px-4 bg-surface-raised border-b border-surface-border shrink-0">
      {/* Left: app name + mode toggle + open project */}
      <div className="flex items-center gap-3">
        <span className="font-semibold text-accent-light text-sm tracking-wide">VibeStudio</span>
        <ModeToggle mode={appMode} onChange={setAppMode} />
        <button
          onClick={handleOpenProject}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-200 transition-colors"
        >
          <FolderOpen size={13} />
          Open Project
        </button>
      </div>

      {/* Center: project name + breadcrumb */}
      <div className="text-xs text-muted truncate max-w-sm">
        {appMode === 'editor' ? (
          <>
            {projectRoot && (
              <span className="text-gray-400 mr-1.5">
                {projectRoot.split('/').pop() ?? projectRoot}
                {selectedFeature ? ' /' : ''}
              </span>
            )}
            {selectedFeature ? (
              <span>
                <span className="text-gray-200">{selectedFeature.name}</span>
                {isDirty && <span className="ml-1 text-accent-light">●</span>}
              </span>
            ) : (
              !projectRoot && <span>No project open</span>
            )}
          </>
        ) : (
          <span className="text-gray-300">All Tools</span>
        )}
      </div>

      {/* Right: Code Peek · Run · Chat · Vibe */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => toggleCodePeek()}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
            codePeekVisible
              ? 'border-accent bg-accent/20 text-accent-light'
              : 'border-surface-border text-muted hover:text-gray-200 hover:border-gray-500'
          }`}
          title={codePeekVisible ? 'Hide Code Peek (Cmd+Shift+C)' : 'Show Code Peek (Cmd+Shift+C)'}
        >
          <Code2 size={12} />
          Code
        </button>
        {runInProgress ? (
          <button
            onClick={handleStop}
            title="Stop the running dev server"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-red-500/50 text-red-400 hover:border-red-400 hover:text-red-300 transition-colors"
          >
            <Square size={12} />
            Stop
          </button>
        ) : (
          <button
            onClick={handleRun}
            title="Run the project's dev server"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-surface-border text-muted hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            <Play size={12} />
            Run
          </button>
        )}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          title={chatOpen ? 'Close Vibe Chat (Cmd+Shift+K)' : 'Open Vibe Chat (Cmd+Shift+K)'}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
            chatOpen
              ? 'border-accent bg-accent/20 text-accent-light'
              : 'border-surface-border text-muted hover:text-gray-200 hover:border-gray-500'
          }`}
        >
          <MessageSquare size={12} />
          Vibe Chat
        </button>
        <button
          onClick={handleVibeCompile}
          disabled={vibeLoading}
          title="Compile all vibe specs into working code"
          className="flex items-center gap-1.5 text-xs px-3 py-1 rounded bg-accent hover:bg-accent/80 disabled:opacity-60 text-white font-medium transition-colors"
        >
          {vibeLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          Vibe
        </button>
      </div>
    </header>
  );
}

function ModeToggle({ mode, onChange }: { mode: AppMode; onChange: (m: AppMode) => void }) {
  return (
    <div className="flex items-center bg-surface border border-surface-border rounded overflow-hidden">
      <button
        onClick={() => onChange('editor')}
        className={`flex items-center gap-1 px-2 py-0.5 text-xs transition-colors ${
          mode === 'editor'
            ? 'bg-accent/20 text-accent-light'
            : 'text-muted hover:text-gray-200'
        }`}
      >
        <PenTool size={10} />
        Editor
      </button>
      <button
        onClick={() => onChange('tools')}
        className={`flex items-center gap-1 px-2 py-0.5 text-xs transition-colors ${
          mode === 'tools'
            ? 'bg-accent/20 text-accent-light'
            : 'text-muted hover:text-gray-200'
        }`}
      >
        <Wrench size={10} />
        Tools
      </button>
    </div>
  );
}
