import React, { useState, useRef, useEffect } from 'react';
import { GitBranch, GitFork, GitMerge, Wifi, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';
import { useGit } from '../../hooks/useGit.ts';

export default function StatusBar() {
  const { currentBranch, branches, projectRoot, codePeekFiles, chatSessions, setChatSessions, setFeatures } = useVibeStore();
  const { switchBranch, createBranch } = useGit();
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [remoteModal, setRemoteModal] = useState<{ owner: string; repo: string; webUrl: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOnMain = currentBranch === 'main' || currentBranch === 'master';
  const objective = parseBranchObjective(currentBranch);

  useEffect(() => {
    if (newBranchOpen) {
      setNewBranchName('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [newBranchOpen]);

  // ── Branch management ────────────────────────────────────────────────────────

  async function handleNewBranchClick() {
    if (!projectRoot) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Open a project first.', { title: 'New Branch', kind: 'info' });
      return;
    }
    setBranchMenuOpen(false);
    setNewBranchOpen(true);
  }

  async function handleCreateBranch() {
    const name = newBranchName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createBranch(name);
      setNewBranchOpen(false);
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(`Branch "${name}" created and checked out.`, { title: 'New Branch', kind: 'info' });
    } catch (err) {
      const errStr = String(err);
      const notRepo = /could not find repository|NotFound|not a repository/i.test(errStr);
      const { message, ask } = await import('@tauri-apps/plugin-dialog');
      if (notRepo && projectRoot) {
        const yes = await ask('This folder is not a git repository. Initialize git here?', { title: 'New Branch', kind: 'info' });
        if (yes) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('git_init', { root: projectRoot });
            await createBranch(name);
            setNewBranchOpen(false);
            await message(`Branch "${name}" created.`, { title: 'New Branch', kind: 'info' });
          } catch (e2) {
            await message(String(e2), { title: 'New Branch', kind: 'error' });
          }
        }
      } else {
        await message(errStr, { title: 'New Branch', kind: 'error' });
      }
    } finally {
      setCreating(false);
    }
  }

  // ── Push ─────────────────────────────────────────────────────────────────────

  async function doPush() {
    if (!projectRoot) return null;
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<{ pr_id: string; url: string }>('push_branch_to_backend', {
      root: projectRoot,
      implementationProofs: codePeekFiles.length > 0 ? codePeekFiles : null,
    });
  }

  async function handlePush() {
    if (!projectRoot) return;
    setPushLoading(true);
    try {
      const result = await doPush();
      if (result) {
        const { message } = await import('@tauri-apps/plugin-dialog');
        await message(`PR created:\n${result.url}`, { title: 'Push', kind: 'info' });
      }
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('NO_REMOTE') || errStr.includes('remote.json')) {
        // Pre-fill from existing remote.json written by `vibe clone` (if present).
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const existing = await invoke<{ owner: string; repo: string; webUrl: string }>(
            'read_remote_config', { root: projectRoot },
          );
          setRemoteModal(existing);
        } catch {
          setRemoteModal({ owner: '', repo: '', webUrl: 'http://localhost:3000' });
        }
      } else {
        const { message } = await import('@tauri-apps/plugin-dialog');
        await message(errStr, { title: 'Push', kind: 'error' });
      }
    } finally {
      setPushLoading(false);
    }
  }

  async function handleRemoteSave() {
    if (!projectRoot || !remoteModal || !remoteModal.owner.trim() || !remoteModal.repo.trim()) return;
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
      if (result) await message(`PR created:\n${result.url}`, { title: 'Push', kind: 'info' });
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Push', kind: 'error' });
    } finally {
      setPushLoading(false);
    }
  }

  // ── Pull ─────────────────────────────────────────────────────────────────────

  async function handlePull() {
    if (!projectRoot) return;
    setPullLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
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

  // ── Merge ─────────────────────────────────────────────────────────────────────

  async function handleMerge() {
    if (!projectRoot || isOnMain) return;
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await ask(
      `Merge "${currentBranch}" into main locally?\n\ngit merge --no-ff ${currentBranch}`,
      { title: 'Merge', kind: 'warning' },
    );
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

  return (
    <div className="flex items-center justify-between h-7 px-2 bg-accent text-white text-xs select-none shrink-0 relative">

      {/* Left: branch + sync arrows */}
      <div className="flex items-center">
        {/* Branch picker */}
        <button
          onClick={() => setBranchMenuOpen((v) => !v)}
          className="flex items-center gap-1.5 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors"
        >
          <GitBranch size={11} />
          <span className="font-mono">{currentBranch}</span>
          {objective && <span className="text-white/60 ml-1">— {objective}</span>}
        </button>

        {/* Sync buttons: push ↑ pull ↓ merge ⌥ — VS Code style */}
        <div className="flex items-center ml-1">
          <SyncBtn
            onClick={handlePush}
            loading={pushLoading}
            title={`Push "${currentBranch}" to remote (create PR)`}
            icon={<ArrowUp size={11} />}
          />
          <SyncBtn
            onClick={handlePull}
            loading={pullLoading}
            title="Pull merged vibes from main"
            icon={<ArrowDown size={11} />}
          />
          {!isOnMain && (
            <SyncBtn
              onClick={handleMerge}
              loading={mergeLoading}
              title={`Merge "${currentBranch}" into main`}
              icon={<GitMerge size={11} />}
            />
          )}
        </div>

        {/* New branch */}
        <button
          onClick={handleNewBranchClick}
          className="flex items-center gap-1 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors ml-1"
        >
          <GitFork size={11} />
          New
        </button>
      </div>

      {/* Right: project root */}
      <div className="flex items-center gap-3 text-white/70">
        {projectRoot && <span className="font-mono truncate max-w-xs">{projectRoot}</span>}
        <Wifi size={11} />
      </div>

      {/* Branch dropdown */}
      {branchMenuOpen && (
        <div className="absolute bottom-7 left-2 bg-surface-overlay border border-surface-border rounded shadow-xl w-64 py-1 z-50">
          {branches.map((b) => (
            <button
              key={b}
              onClick={() => { switchBranch(b); setBranchMenuOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-raised transition-colors ${
                b === currentBranch ? 'text-accent-light' : 'text-gray-300'
              }`}
            >
              {b === currentBranch ? '✓ ' : '  '}{b}
            </button>
          ))}
        </div>
      )}

      {/* New branch dialog */}
      {newBranchOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => !creating && setNewBranchOpen(false)}>
          <div className="bg-surface-overlay border border-surface-border rounded-lg shadow-xl w-80 p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-200 mb-2">New branch name</p>
            <input
              ref={inputRef}
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateBranch();
                if (e.key === 'Escape') setNewBranchOpen(false);
              }}
              placeholder="e.g. feature/add-billing-vibe"
              className="w-full px-3 py-2 rounded bg-surface border border-surface-border text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={() => !creating && setNewBranchOpen(false)} className="px-3 py-1.5 text-xs rounded border border-surface-border text-muted hover:text-gray-200">
                Cancel
              </button>
              <button type="button" onClick={handleCreateBranch} disabled={creating || !newBranchName.trim()} className="px-3 py-1.5 text-xs rounded bg-accent text-white font-medium disabled:opacity-50">
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configure remote modal */}
      {remoteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setRemoteModal(null)}>
          <div className="bg-surface-raised border border-surface-border rounded-lg shadow-xl p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Configure remote</h3>
            <p className="text-xs text-muted mb-3">Add owner, repo and web app URL so Push can create a PR.</p>
            <div className="space-y-2 mb-4">
              <input type="text" placeholder="Owner (e.g. ims)" value={remoteModal.owner}
                onChange={(e) => setRemoteModal((m) => m && { ...m, owner: e.target.value })}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent" />
              <input type="text" placeholder="Repo (e.g. test)" value={remoteModal.repo}
                onChange={(e) => setRemoteModal((m) => m && { ...m, repo: e.target.value })}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent" />
              <input type="text" placeholder="Web URL (e.g. http://localhost:3000)" value={remoteModal.webUrl}
                onChange={(e) => setRemoteModal((m) => m && { ...m, webUrl: e.target.value })}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent" />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setRemoteModal(null)} className="text-xs px-2.5 py-1 rounded border border-surface-border text-muted hover:text-gray-200">Cancel</button>
              <button type="button" onClick={handleRemoteSave} disabled={pushLoading || !remoteModal.owner.trim() || !remoteModal.repo.trim()} className="text-xs px-2.5 py-1 rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50">
                {pushLoading ? 'Pushing…' : 'Save & Push'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncBtn({ onClick, loading, title, icon }: {
  onClick: () => void;
  loading: boolean;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className="flex items-center justify-center w-6 h-6 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : icon}
    </button>
  );
}

function parseBranchObjective(branch: string): string | null {
  const match = branch.match(/^(?:feature|feat|fix|chore)\/(.+)$/);
  if (!match) return null;
  return match[1].replace(/-/g, ' ');
}
