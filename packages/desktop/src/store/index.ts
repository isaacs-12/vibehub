import { create } from 'zustand';

export interface FeatureNode {
  name: string;           // kebab-case stem
  path: string;           // relative: ".vibe/features/auth.md"
  content: string;        // raw markdown
  children?: FeatureNode[]; // for nested groupings
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  vibeContext?: string;   // which vibe file was active
}

interface VibeStore {
  // Project
  projectRoot: string | null;
  features: FeatureNode[];
  selectedFeature: FeatureNode | null;
  editorContent: string;
  isDirty: boolean;

  // Code Peek
  codePeekVisible: boolean;
  codePeekFiles: Array<{ path: string; content: string }>;

  // Chat
  chatMessages: ChatMessage[];
  chatOpen: boolean;

  // Git
  currentBranch: string;
  branches: string[];

  // Actions
  setProjectRoot: (root: string) => void;
  setFeatures: (features: FeatureNode[]) => void;
  selectFeature: (feature: FeatureNode) => void;
  updateEditorContent: (content: string) => void;
  saveFeature: () => Promise<void>;
  toggleCodePeek: () => void;
  setCodePeekFiles: (files: Array<{ path: string; content: string }>) => void;
  appendChatMessage: (msg: ChatMessage) => void;
  setChatOpen: (open: boolean) => void;
  setGitBranch: (branch: string, branches: string[]) => void;
}

export const useVibeStore = create<VibeStore>((set, get) => ({
  projectRoot: null,
  features: [],
  selectedFeature: null,
  editorContent: '',
  isDirty: false,
  codePeekVisible: true,
  codePeekFiles: [],
  chatMessages: [],
  chatOpen: false,
  currentBranch: 'main',
  branches: [],

  setProjectRoot: (root) => set({ projectRoot: root }),
  setFeatures: (features) => set({ features }),

  selectFeature: (feature) =>
    set({ selectedFeature: feature, editorContent: feature.content, isDirty: false }),

  updateEditorContent: (content) =>
    set((s) => ({ editorContent: content, isDirty: content !== s.selectedFeature?.content })),

  saveFeature: async () => {
    const { selectedFeature, editorContent, projectRoot } = get();
    if (!selectedFeature || !projectRoot) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_vibe_file', {
      root: projectRoot,
      relativePath: selectedFeature.path,
      content: editorContent,
    });
    set((s) => ({
      isDirty: false,
      features: s.features.map((f) =>
        f.path === selectedFeature.path ? { ...f, content: editorContent } : f,
      ),
    }));
  },

  toggleCodePeek: () => set((s) => ({ codePeekVisible: !s.codePeekVisible })),
  setCodePeekFiles: (files) => set({ codePeekFiles: files }),
  appendChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  setChatOpen: (open) => set({ chatOpen: open }),
  setGitBranch: (branch, branches) => set({ currentBranch: branch, branches }),
}));
