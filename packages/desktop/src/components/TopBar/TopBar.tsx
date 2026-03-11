import React from 'react';
import { Zap, MessageSquare, FolderOpen } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';
import { useVibeProject } from '../../hooks/useVibeProject.ts';

export default function TopBar() {
  const { setChatOpen, chatOpen, isDirty, selectedFeature, saveFeature } = useVibeStore();
  const { openProject } = useVibeProject();

  async function handleOpenProject() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Open Vibe Project',
      });
      if (selected && typeof selected === 'string') {
        openProject(selected);
      }
    } catch (err) {
      console.error('Open Project failed:', err);
      alert(`Could not open folder picker: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleVibeCompile() {
    const { invoke } = await import('@tauri-apps/api/core');
    const { projectRoot } = useVibeStore.getState();
    if (!projectRoot) return;
    // Save current file first
    await saveFeature();
    // Trigger the Vibe→Code AI compilation
    await invoke('compile_vibes', { root: projectRoot });
  }

  return (
    <header className="flex items-center justify-between h-10 px-4 bg-surface-raised border-b border-surface-border shrink-0">
      {/* Left: app name + open project */}
      <div className="flex items-center gap-3">
        <span className="font-semibold text-accent-light text-sm tracking-wide">Vibe Studio</span>
        <button
          onClick={handleOpenProject}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-200 transition-colors"
        >
          <FolderOpen size={13} />
          Open Project
        </button>
      </div>

      {/* Center: current file breadcrumb */}
      <div className="text-xs text-muted truncate max-w-sm">
        {selectedFeature ? (
          <span>
            features / <span className="text-gray-200">{selectedFeature.name}</span>
            {isDirty && <span className="ml-1 text-accent-light">●</span>}
          </span>
        ) : (
          <span>No feature selected</span>
        )}
      </div>

      {/* Right: Chat + Vibe compile */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setChatOpen(!chatOpen)}
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
          className="flex items-center gap-1.5 text-xs px-3 py-1 rounded bg-accent hover:bg-accent/80 text-white font-medium transition-colors"
        >
          <Zap size={12} />
          Vibe
        </button>
      </div>
    </header>
  );
}
