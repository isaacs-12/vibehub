import React, { useState, useRef, useEffect } from 'react';
import { GitBranch, GitFork, Wifi } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';
import { useGit } from '../../hooks/useGit.ts';

export default function StatusBar() {
  const { currentBranch, branches, projectRoot } = useVibeStore();
  const { switchBranch, createBranch } = useGit();
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const objective = parseBranchObjective(currentBranch);

  useEffect(() => {
    if (newBranchOpen) {
      setNewBranchName('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [newBranchOpen]);

  async function handleNewBranchClick() {
    if (!projectRoot) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message('Open a project first (Open Project in the top bar).', { title: 'New Branch', kind: 'info' });
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
            await message(`Branch "${name}" created and checked out.`, { title: 'New Branch', kind: 'info' });
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

  return (
    <div className="flex items-center justify-between h-7 px-3 bg-accent text-white text-xs select-none shrink-0 relative">
      {/* Left: branch / objective */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setBranchMenuOpen((v) => !v)}
          className="flex items-center gap-1.5 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors"
        >
          <GitBranch size={11} />
          <span className="font-mono">{currentBranch}</span>
          {objective && <span className="text-accent-light/80 ml-1">— {objective}</span>}
        </button>

        <button
          onClick={handleNewBranchClick}
          className="flex items-center gap-1 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors"
        >
          <GitFork size={11} />
          New Branch
        </button>
      </div>

      {/* Right: project root + connection */}
      <div className="flex items-center gap-3 text-white/70">
        {projectRoot && <span className="font-mono truncate max-w-xs">{projectRoot}</span>}
        <Wifi size={11} />
      </div>

      {/* Branch dropdown */}
      {branchMenuOpen && (
        <div className="absolute bottom-7 left-3 bg-surface-overlay border border-surface-border rounded shadow-xl w-64 py-1 z-50">
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
          <div
            className="bg-surface-overlay border border-surface-border rounded-lg shadow-xl w-80 p-4"
            onClick={(e) => e.stopPropagation()}
          >
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
              <button
                type="button"
                onClick={() => !creating && setNewBranchOpen(false)}
                className="px-3 py-1.5 text-xs rounded border border-surface-border text-muted hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateBranch}
                disabled={creating || !newBranchName.trim()}
                className="px-3 py-1.5 text-xs rounded bg-accent text-white font-medium disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseBranchObjective(branch: string): string | null {
  const match = branch.match(/^(?:feature|feat|fix|chore)\/(.+)$/);
  if (!match) return null;
  return match[1].replace(/-/g, ' ');
}
