import { useCallback } from 'react';
import { useVibeStore } from '../store/index.ts';

export function useGit() {
  const { projectRoot, setGitBranch } = useVibeStore();

  const switchBranch = useCallback(async (branch: string) => {
    if (!projectRoot) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('git_checkout', { root: projectRoot, branch });
    const git = await invoke<{ branch: string; branches: string[] }>('get_git_state', { root: projectRoot });
    setGitBranch(git.branch, git.branches);
  }, [projectRoot, setGitBranch]);

  const createBranch = useCallback(async (name: string) => {
    if (!projectRoot) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('git_create_branch', { root: projectRoot, name });
    const git = await invoke<{ branch: string; branches: string[] }>('get_git_state', { root: projectRoot });
    setGitBranch(git.branch, git.branches);
  }, [projectRoot, setGitBranch]);

  return { switchBranch, createBranch };
}
