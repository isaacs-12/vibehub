import { useCallback } from 'react';
import { useVibeStore } from '../store/index.ts';
import type { ChatSession, FeatureNode } from '../store/index.ts';

export function useVibeProject() {
  const { resetProjectState, setFeatures, setGitBranch, setChatSessions } = useVibeStore();

  const openProject = useCallback(async (root: string) => {
    const { invoke } = await import('@tauri-apps/api/core');

    // ── 1. Save current project's chats before switching ──────────────────────
    const { projectRoot: oldRoot, chatSessions } = useVibeStore.getState();
    if (oldRoot && oldRoot !== root) {
      try {
        await invoke('save_chats', {
          root: oldRoot,
          sessionsJson: JSON.stringify(chatSessions),
        });
      } catch {
        // Best-effort — don't block the switch if saving fails
      }
    }

    // ── 2. Reset all project-specific state atomically ─────────────────────────
    resetProjectState(root);
    localStorage.setItem('lastProjectRoot', root);

    // ── 3. Load feature tree ───────────────────────────────────────────────────
    const raw = await invoke<Array<{ name: string; path: string; content: string }>>(
      'list_vibe_features', { root },
    );
    const features: FeatureNode[] = raw.map((f) => ({
      name: f.name,
      path: f.path,
      content: f.content,
    }));
    setFeatures(features);

    // ── 4. Load git state ──────────────────────────────────────────────────────
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

    // ── 5. Load persisted chats for this project ───────────────────────────────
    try {
      const json = await invoke<string>('load_chats', { root });
      const sessions = JSON.parse(json) as ChatSession[];
      if (Array.isArray(sessions) && sessions.length > 0) {
        setChatSessions(sessions);
      }
    } catch {
      // No saved chats — the fresh session from resetProjectState is fine
    }
  }, [resetProjectState, setFeatures, setGitBranch, setChatSessions]);

  return { openProject };
}
