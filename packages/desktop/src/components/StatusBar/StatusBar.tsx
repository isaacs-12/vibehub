import React, { useState, useRef, useEffect } from 'react';
import { GitBranch, GitFork, GitMerge, ArrowUp, ArrowDown, Loader2, User, Settings, ExternalLink, Copy, Check, RefreshCw, Trash2 } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';
import { useGit } from '../../hooks/useGit.ts';
import { startLogin, getLoginUrl, handleAuthDeepLink } from '../../lib/auth.ts';

export default function StatusBar() {
  const { currentBranch, branches, projectRoot, codePeekFiles, chatSessions, setChatSessions, authUser, authToken, clearAuth } = useVibeStore();
  const { switchBranch, createBranch, syncWithMain, deleteBranch, reloadFeatures } = useGit();
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [remoteModal, setRemoteModal] = useState<{ owner: string; repo: string; webUrl: string } | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOnMain = currentBranch === 'main' || currentBranch === 'master';
  const objective = parseBranchObjective(currentBranch);

  useEffect(() => {
    if (newBranchOpen) {
      setNewBranchName('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [newBranchOpen]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [userMenuOpen]);

  // ── Remote config ───────────────────────────────────────────────────────────

  async function handleOpenRemoteConfig() {
    if (!projectRoot) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const existing = await invoke<{ owner: string; repo: string; webUrl: string }>(
        'read_remote_config', { root: projectRoot },
      );
      setRemoteModal(existing);
    } catch {
      setRemoteModal({ owner: '', repo: '', webUrl: 'https://getvibehub.com' });
    }
  }

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
    return invoke<{ pr_id: string; url: string; updated: boolean }>('push_branch_to_backend', {
      root: projectRoot,
      implementationProofs: codePeekFiles.length > 0 ? codePeekFiles : null,
      authToken: authToken ?? null,
    });
  }

  async function handlePush() {
    if (!projectRoot) return;
    if (isOnMain) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Create a feature branch before pushing. You can\'t propose changes directly from main.', { title: 'Push', kind: 'warning' });
      return;
    }
    setPushLoading(true);
    try {
      const result = await doPush();
      if (result) {
        const { message } = await import('@tauri-apps/plugin-dialog');
        await message(`${result.updated ? 'PR updated' : 'PR created'}:\n${result.url}`, { title: 'Push', kind: 'info' });
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
          setRemoteModal({ owner: '', repo: '', webUrl: 'https://getvibehub.com' });
        }
      } else {
        const { message } = await import('@tauri-apps/plugin-dialog');
        await message(errStr, { title: 'Push', kind: 'error' });
      }
    } finally {
      setPushLoading(false);
    }
  }

  async function handleRemoteSave(andPush = false) {
    if (!projectRoot || !remoteModal || !remoteModal.owner.trim() || !remoteModal.repo.trim()) return;
    setPushLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_remote_config', {
        root: projectRoot,
        owner: remoteModal.owner.trim(),
        repo: remoteModal.repo.trim(),
        webUrl: remoteModal.webUrl.trim() || 'https://getvibehub.com',
      });
      setRemoteModal(null);
      if (andPush) {
        const { message } = await import('@tauri-apps/plugin-dialog');
        const result = await doPush();
        if (result) await message(`${result.updated ? 'PR updated' : 'PR created'}:\n${result.url}`, { title: 'Push', kind: 'info' });
      }
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Remote', kind: 'error' });
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
      await invoke<Array<{ name: string; path: string; content: string }>>('pull_from_remote', { root: projectRoot, authToken: authToken ?? null });
      await reloadFeatures();
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Pulled latest vibes from main.', { title: 'Pull', kind: 'info' });
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
      await reloadFeatures();
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(result, { title: 'Merge', kind: 'info' });
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Merge', kind: 'error' });
    } finally {
      setMergeLoading(false);
    }
  }

  // ── Sync with main ────────────────────────────────────────────────────────────

  async function handleSync() {
    if (!projectRoot || isOnMain) return;
    setSyncLoading(true);
    try {
      await syncWithMain();
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(`Synced "${currentBranch}" with latest main.`, { title: 'Sync', kind: 'info' });
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Sync', kind: 'error' });
    } finally {
      setSyncLoading(false);
    }
  }

  // ── Delete branch ─────────────────────────────────────────────────────────────

  async function handleDeleteBranch(branch: string) {
    if (!projectRoot) return;
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await ask(
      `Delete local branch "${branch}"?\n\nThis cannot be undone.`,
      { title: 'Delete Branch', kind: 'warning' },
    );
    if (!confirmed) return;
    try {
      await deleteBranch(branch);
      setBranchMenuOpen(false);
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(`Branch "${branch}" deleted.`, { title: 'Delete Branch', kind: 'info' });
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Delete Branch', kind: 'error' });
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
            disabled={isOnMain}
            title={isOnMain ? 'Create a feature branch to propose changes' : `Push "${currentBranch}" to remote (create PR)`}
            icon={<ArrowUp size={11} />}
          />
          <SyncBtn
            onClick={handlePull}
            loading={pullLoading}
            title="Pull merged vibes from main"
            icon={<ArrowDown size={11} />}
          />
          {!isOnMain && (
            <>
              <SyncBtn
                onClick={handleSync}
                loading={syncLoading}
                title={`Sync "${currentBranch}" with latest main`}
                icon={<RefreshCw size={11} />}
              />
              <SyncBtn
                onClick={handleMerge}
                loading={mergeLoading}
                title={`Merge "${currentBranch}" into main`}
                icon={<GitMerge size={11} />}
              />
            </>
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

      {/* Right: remote config + auth + project root */}
      <div className="flex items-center gap-2 text-white/70">
        {projectRoot && <span className="font-mono truncate max-w-xs">{projectRoot}</span>}
        {authUser ? (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              title={`Signed in as ${authUser.name ?? authUser.email}`}
              className="flex items-center gap-1 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors"
            >
              <User size={11} />
              <span className="text-[10px] max-w-[100px] truncate">{authUser.name ?? authUser.email}</span>
            </button>
            {userMenuOpen && (
              <div className="absolute bottom-7 right-0 bg-surface-overlay border border-surface-border rounded shadow-xl w-48 py-1 z-50">
                <div className="px-3 py-1.5 text-[10px] text-gray-400 truncate border-b border-surface-border mb-1">
                  {authUser.email}
                </div>
                <button
                  onClick={() => { handleOpenRemoteConfig(); setUserMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-raised transition-colors flex items-center gap-2"
                >
                  <Settings size={11} /> Configure remote
                </button>
                <button
                  onClick={() => { clearAuth(); setUserMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-raised transition-colors flex items-center gap-2"
                >
                  <ExternalLink size={11} /> Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setSignInOpen(true)}
            title="Sign in to VibeHub"
            className="flex items-center gap-1 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors"
          >
            <User size={11} />
            <span className="text-[10px]">Sign in</span>
          </button>
        )}
      </div>

      {/* Branch dropdown */}
      {branchMenuOpen && (
        <div className="absolute bottom-7 left-2 bg-surface-overlay border border-surface-border rounded shadow-xl w-64 py-1 z-50">
          {branches.map((b) => {
            const isCurrent = b === currentBranch;
            const isMain = b === 'main' || b === 'master';
            const canDelete = !isCurrent && !isMain;
            return (
              <div key={b} className="flex items-center group">
                <button
                  onClick={() => { switchBranch(b); setBranchMenuOpen(false); }}
                  className={`flex-1 text-left px-3 py-1.5 text-xs hover:bg-surface-raised transition-colors ${
                    isCurrent ? 'text-accent-light' : 'text-gray-300'
                  }`}
                >
                  {isCurrent ? '✓ ' : '  '}{b}
                </button>
                {canDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteBranch(b); }}
                    title={`Delete "${b}"`}
                    className="px-2 py-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
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
              <input type="text" placeholder="Web URL (e.g. https://getvibehub.com)" value={remoteModal.webUrl}
                onChange={(e) => setRemoteModal((m) => m && { ...m, webUrl: e.target.value })}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent" />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setRemoteModal(null)} className="text-xs px-2.5 py-1 rounded border border-surface-border text-muted hover:text-gray-200">Cancel</button>
              <button type="button" onClick={() => handleRemoteSave(false)} disabled={pushLoading || !remoteModal.owner.trim() || !remoteModal.repo.trim()} className="text-xs px-2.5 py-1 rounded border border-surface-border text-gray-200 hover:bg-surface disabled:opacity-50">
                Save
              </button>
              <button type="button" onClick={() => handleRemoteSave(true)} disabled={pushLoading || !remoteModal.owner.trim() || !remoteModal.repo.trim()} className="text-xs px-2.5 py-1 rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50">
                {pushLoading ? 'Pushing…' : 'Save & Push'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign in modal */}
      {signInOpen && (
        <SignInModal onClose={() => setSignInOpen(false)} />
      )}
    </div>
  );
}

function SignInModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [pasteToken, setPasteToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const loginUrl = getLoginUrl();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function handleOpenBrowser() {
    await startLogin();
  }

  async function handlePasteToken() {
    const token = pasteToken.trim();
    if (!token) return;
    try {
      await handleAuthDeepLink(`vibehub://auth?token=${token}`);
      const { authUser } = useVibeStore.getState();
      if (authUser) {
        onClose();
      } else {
        setTokenError('Invalid token. Make sure you copied the full token from the browser.');
      }
    } catch {
      setTokenError('Invalid token. Make sure you copied the full token from the browser.');
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface-overlay border border-surface-border rounded-lg shadow-xl w-96 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-200 mb-2">Sign in to VibeHub</h3>
        <p className="text-xs text-muted mb-4">
          Sign in with your VibeHub account to push and pull specs.
        </p>

        {/* Step 1: Open browser */}
        <div className="mb-3">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5 font-semibold">Step 1 — Sign in</div>
          <button
            type="button"
            onClick={handleOpenBrowser}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs rounded bg-accent text-white font-medium hover:bg-accent/80 transition-colors"
          >
            <ExternalLink size={13} />
            Open in Browser
          </button>
          <div className="flex items-center gap-1.5 mt-2">
            <input
              type="text"
              readOnly
              value={loginUrl}
              className="flex-1 bg-surface border border-surface-border rounded px-2 py-1.5 text-[10px] text-gray-400 font-mono select-all focus:outline-none focus:border-accent truncate"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              title="Copy link"
              className="px-2 py-1.5 rounded border border-surface-border text-muted hover:text-gray-200 hover:border-gray-500 transition-colors shrink-0"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Step 2: Paste token */}
        <div className="mb-3 pt-3 border-t border-surface-border">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5 font-semibold">Step 2 — Paste token</div>
          <p className="text-[10px] text-muted mb-1.5">After signing in, copy the token from the browser and paste it here.</p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={pasteToken}
              onChange={(e) => { setPasteToken(e.target.value); setTokenError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePasteToken(); }}
              placeholder="Paste token here…"
              className="flex-1 bg-surface border border-surface-border rounded px-2 py-1.5 text-[11px] text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handlePasteToken}
              disabled={!pasteToken.trim()}
              className="px-3 py-1.5 text-xs rounded bg-accent text-white font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors shrink-0"
            >
              Connect
            </button>
          </div>
          {tokenError && <p className="text-[10px] text-red-400 mt-1">{tokenError}</p>}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded border border-surface-border text-muted hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SyncBtn({ onClick, loading, disabled, title, icon }: {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
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
