import { useCallback } from 'react';
import { useVibeStore } from '../store/index.ts';
import type { FeatureNode } from '../store/index.ts';

export function useVibeProject() {
  const { setProjectRoot, setFeatures, setGitBranch } = useVibeStore();

  const openProject = useCallback(async (root: string) => {
    // Dynamic import so this works even in Storybook / tests without Tauri
    const { invoke } = await import('@tauri-apps/api/core');

    setProjectRoot(root);
    localStorage.setItem('lastProjectRoot', root);

    // Load feature tree
    const raw = await invoke<Array<{ name: string; path: string; content: string }>>('list_vibe_features', { root });
    const features: FeatureNode[] = raw.map((f) => ({
      name: f.name,
      path: f.path,
      content: f.content,
    }));
    setFeatures(features);

    // Load git state; if not a repo, init and retry
    try {
      const git = await invoke<{ branch: string; branches: string[] }>('get_git_state', { root });
      setGitBranch(git.branch, git.branches);
    } catch {
      try {
        await invoke('git_init', { root });
        const git = await invoke<{ branch: string; branches: string[] }>('get_git_state', { root });
        setGitBranch(git.branch, git.branches);
      } catch {
        setGitBranch('main', ['main']);
      }
    }
  }, [setProjectRoot, setFeatures, setGitBranch]);

  return { openProject };
}
