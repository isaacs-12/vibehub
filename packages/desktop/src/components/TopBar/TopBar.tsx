import React, { useState } from 'react';
import { Zap, MessageSquare, FolderOpen, Loader2, Play, Code2, Upload, Download, GitMerge } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';
import { useVibeProject } from '../../hooks/useVibeProject.ts';

export default function TopBar() {
  const { setChatOpen, chatOpen, isDirty, selectedFeature, saveFeature, projectRoot, setCodePeekFiles, clearRunOutput, setRunOutputVisible, codePeekVisible, toggleCodePeek, runInProgress, setRunInProgress, codePeekFiles } = useVibeStore();
  const { openProject } = useVibeProject();
  const [vibeLoading, setVibeLoading] = useState(false);

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

  async function handleVibeCompile() {
    if (!projectRoot) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Open a project first (Open Project in the top bar).', { title: 'Vibe', kind: 'info' });
      return;
    }
    setVibeLoading(true);
    try {
      await saveFeature();
      const { invoke } = await import('@tauri-apps/api/core');
      const { message } = await import('@tauri-apps/plugin-dialog');
      const result = await invoke<string>('compile_vibes', { root: projectRoot });
      await message(result ?? 'Done.', { title: 'Vibe', kind: 'info' });
      // Refresh Code Peek so generated files show up
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

  const [pushLoading, setPushLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [remoteModal, setRemoteModal] = useState<{ owner: string; repo: string; webUrl: string } | null>(null);

  async function doPush() {
    if (!projectRoot) return null;
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<{ pr_id: string; url: string }>('push_branch_to_backend', {
      root: projectRoot,
      implementationProofs: codePeekFiles.length > 0 ? codePeekFiles : null,
    });
  }

  async function handlePush() {
    if (!projectRoot) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Open a project first.', { title: 'Push', kind: 'info' });
      return;
    }
    setPushLoading(true);
    try {
      const result = await doPush();
      if (result) {
        const { message } = await import('@tauri-apps/plugin-dialog');
        await message(`PR created. Open in your browser:\n${result.url}`, { title: 'Push', kind: 'info' });
      }
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('NO_REMOTE') || errStr.includes('remote.json')) {
        setRemoteModal({ owner: '', repo: '', webUrl: 'http://localhost:3000' });
      } else {
        const { message } = await import('@tauri-apps/plugin-dialog');
        await message(errStr, { title: 'Push', kind: 'error' });
      }
    } finally {
      setPushLoading(false);
    }
  }

  async function handleRemoteSave() {
    if (!projectRoot || !remoteModal || remoteModal.owner.trim() === '' || remoteModal.repo.trim() === '') return;
    setPushLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { message } = await import('@tauri-apps/plugin-dialog');
      await invoke('write_remote_config', {
        root: projectRoot,
        owner: remoteModal.owner.trim(),
        repo: remoteModal.repo.trim(),
        webUrl: remoteModal.webUrl.trim() || 'http://localhost:3000',
      });
      setRemoteModal(null);
      const result = await doPush();
      if (result) {
        await message(`PR created. Open in your browser:\n${result.url}`, { title: 'Push', kind: 'info' });
      }
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Push', kind: 'error' });
    } finally {
      setPushLoading(false);
    }
  }

  async function handleMerge() {
    if (!projectRoot) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Open a project first.', { title: 'Merge', kind: 'info' });
      return;
    }
    const { currentBranch } = useVibeStore.getState();
    if (currentBranch === 'main' || currentBranch === 'master') {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('You are already on main — switch to a feature branch first.', { title: 'Merge', kind: 'info' });
      return;
    }
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await ask(`Merge "${currentBranch}" into main?\n\nThis will run: git merge --no-ff ${currentBranch}`, { title: 'Merge', kind: 'warning' });
    if (!confirmed) return;
    setMergeLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<string>('merge_branch_locally', { root: projectRoot, branch: currentBranch });
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(result, { title: 'Merge', kind: 'info' });
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Merge', kind: 'error' });
    } finally {
      setMergeLoading(false);
    }
  }

  async function handlePull() {
    if (!projectRoot) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Open a project first.', { title: 'Pull', kind: 'info' });
      return;
    }
    setPullLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { setFeatures } = useVibeStore.getState();
      const pulled = await invoke<Array<{ name: string; path: string; content: string }>>('pull_from_remote', { root: projectRoot });
      setFeatures(pulled.map((f) => ({ name: f.name, path: f.path, content: f.content })));
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(`Pulled ${pulled.length} vibe file${pulled.length !== 1 ? 's' : ''} from main.`, { title: 'Pull', kind: 'info' });
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Pull', kind: 'error' });
    } finally {
      setPullLoading(false);
    }
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

      {/* Right: Code Peek + Run + Chat + Vibe compile */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => toggleCodePeek()}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
            codePeekVisible
              ? 'border-accent bg-accent/20 text-accent-light'
              : 'border-surface-border text-muted hover:text-gray-200 hover:border-gray-500'
          }`}
          title={codePeekVisible ? 'Hide Code Peek' : 'Show Code Peek'}
        >
          <Code2 size={12} />
          Code
        </button>
        <button
          onClick={handleRun}
          disabled={runInProgress}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-surface-border text-muted hover:text-gray-200 hover:border-gray-500 disabled:opacity-50 transition-colors"
        >
          <Play size={12} />
          {runInProgress ? 'Running…' : 'Run'}
        </button>
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
          disabled={vibeLoading}
          className="flex items-center gap-1.5 text-xs px-3 py-1 rounded bg-accent hover:bg-accent/80 disabled:opacity-60 text-white font-medium transition-colors"
        >
          {vibeLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          Vibe
        </button>
        <button
          onClick={handlePush}
          disabled={pushLoading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-surface-border text-muted hover:text-gray-200 hover:border-gray-500 disabled:opacity-50 transition-colors"
          title="Push branch to backend (create PR in web app)"
        >
          {pushLoading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          Push
        </button>
        <button
          onClick={handlePull}
          disabled={pullLoading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-surface-border text-muted hover:text-gray-200 hover:border-gray-500 disabled:opacity-50 transition-colors"
          title="Pull merged vibe changes from main into local project"
        >
          {pullLoading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Pull
        </button>
        <button
          onClick={handleMerge}
          disabled={mergeLoading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-surface-border text-muted hover:text-gray-200 hover:border-gray-500 disabled:opacity-50 transition-colors"
          title="Merge current branch into main locally"
        >
          {mergeLoading ? <Loader2 size={12} className="animate-spin" /> : <GitMerge size={12} />}
          Merge
        </button>
      </div>

      {/* Configure remote modal (when .vibe/remote.json is missing) */}
      {remoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRemoteModal(null)}>
          <div
            className="bg-surface-raised border border-surface-border rounded-lg shadow-xl p-4 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Configure remote</h3>
            <p className="text-xs text-muted mb-3">Add owner, repo and web app URL so Push can create a PR.</p>
            <div className="space-y-2 mb-4">
              <input
                type="text"
                placeholder="Owner (e.g. ims)"
                value={remoteModal.owner}
                onChange={(e) => setRemoteModal((m) => m && { ...m, owner: e.target.value })}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                type="text"
                placeholder="Repo (e.g. test)"
                value={remoteModal.repo}
                onChange={(e) => setRemoteModal((m) => m && { ...m, repo: e.target.value })}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                type="text"
                placeholder="Web URL (e.g. http://localhost:3000)"
                value={remoteModal.webUrl}
                onChange={(e) => setRemoteModal((m) => m && { ...m, webUrl: e.target.value })}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRemoteModal(null)}
                className="text-xs px-2.5 py-1 rounded border border-surface-border text-muted hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoteSave}
                disabled={pushLoading || !remoteModal.owner.trim() || !remoteModal.repo.trim()}
                className="text-xs px-2.5 py-1 rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
              >
                {pushLoading ? 'Pushing…' : 'Save & Push'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
