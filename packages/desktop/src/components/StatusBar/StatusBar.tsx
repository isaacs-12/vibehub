import React, { useState } from 'react';
import { GitBranch, GitFork, Wifi } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';
import { useGit } from '../../hooks/useGit.ts';

export default function StatusBar() {
  const { currentBranch, branches, projectRoot } = useVibeStore();
  const { switchBranch, createBranch } = useGit();
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);

  const objective = parseBranchObjective(currentBranch);

  async function handleNewBranch() {
    const name = prompt('Branch name (e.g. feature/add-billing-vibe):');
    if (name) await createBranch(name);
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
          onClick={handleNewBranch}
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
    </div>
  );
}

function parseBranchObjective(branch: string): string | null {
  const match = branch.match(/^(?:feature|feat|fix|chore)\/(.+)$/);
  if (!match) return null;
  return match[1].replace(/-/g, ' ');
}
