import { useCallback } from 'react';
import { useVibeStore } from '../store/index.ts';

/** Reload .vibe/features/ from disk into the store. Call after any git operation that changes files. */
async function reloadFeatures(root: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  const raw = await invoke<Array<{ name: string; path: string; content: string }>>(
    'list_vibe_features', { root },
  );
  useVibeStore.setState({
    features: raw.map((f) => ({ name: f.name, path: f.path, content: f.content })),
    // Clear selection — the previously selected file may not exist on this branch
    selectedFeature: null,
    editorContent: '',
    isDirty: false,
  });
}

export function useGit() {
  const { projectRoot, setGitBranch } = useVibeStore();

  const switchBranch = useCallback(async (branch: string) => {
    if (!projectRoot) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('git_checkout', { root: projectRoot, branch });
    const git = await invoke<{ branch: string; branches: string[] }>('get_git_state', { root: projectRoot });
    setGitBranch(git.branch, git.branches);
    await reloadFeatures(projectRoot);
  }, [projectRoot, setGitBranch]);

  const createBranch = useCallback(async (name: string) => {
    if (!projectRoot) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('git_create_branch', { root: projectRoot, name });
    const git = await invoke<{ branch: string; branches: string[] }>('get_git_state', { root: projectRoot });
    setGitBranch(git.branch, git.branches);
    await reloadFeatures(projectRoot);
  }, [projectRoot, setGitBranch]);

  /** Merge main into the current feature branch to sync with latest changes. */
  const syncWithMain = useCallback(async () => {
    if (!projectRoot) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<string>('sync_branch_with_main', { root: projectRoot });
    const git = await invoke<{ branch: string; branches: string[] }>('get_git_state', { root: projectRoot });
    setGitBranch(git.branch, git.branches);
    await reloadFeatures(projectRoot);
  }, [projectRoot, setGitBranch]);

  /** Delete a local branch (cannot delete current branch or main). */
  const deleteBranch = useCallback(async (branch: string) => {
    if (!projectRoot) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('git_delete_branch', { root: projectRoot, branch });
    const git = await invoke<{ branch: string; branches: string[] }>('get_git_state', { root: projectRoot });
    setGitBranch(git.branch, git.branches);
  }, [projectRoot, setGitBranch]);

  return { switchBranch, createBranch, syncWithMain, deleteBranch, reloadFeatures: () => projectRoot ? reloadFeatures(projectRoot) : Promise.resolve() };
}
