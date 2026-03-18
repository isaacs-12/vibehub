import { create } from 'zustand';

export interface FeatureNode {
  name: string;           // kebab-case stem
  path: string;           // relative: ".vibe/features/auth.md"
  content: string;        // raw markdown
  children?: FeatureNode[]; // for nested groupings
}

export type ChatAction =
  | { type: 'reply'; label: string; text: string }
  | { type: 'apply'; label: string }
  | { type: 'create_feature'; label: string; name: string }
  | { type: 'integration'; label: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  vibeContext?: string;   // which vibe file was active
  actions?: ChatAction[];
}

export interface ChatSession {
  id: string;
  title: string;         // e.g. "Chat 1" or first message preview
  messages: ChatMessage[];
}

export type AppMode = 'editor' | 'tools';

export interface ToolVariable {
  name: string;        // e.g. "OPENAI_API_KEY"
  description: string; // what it's for
  required: boolean;
}

export interface ToolEntry {
  root: string;        // absolute project path
  name: string;        // human-friendly tool name
  description: string; // one-liner from manifest
  variables: ToolVariable[];
  connects: string[];  // integration names
}

export interface ToolConfig {
  [varName: string]: string; // user-supplied variable values
}

function createSession(title = 'New chat'): ChatSession {
  return { id: crypto.randomUUID(), title, messages: [] };
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

  // Chat (multiple sessions)
  chatSessions: ChatSession[];
  activeChatId: string | null;
  chatOpen: boolean;

  // Git
  currentBranch: string;
  branches: string[];

  // Run output (in-app terminal)
  runOutputLines: Array<{ line: string; stderr?: boolean }>;
  runOutputVisible: boolean;
  runInProgress: boolean;

  // App mode
  appMode: AppMode;

  // Tool registry (all known local projects/tools)
  tools: ToolEntry[];
  toolConfigs: Record<string, ToolConfig>; // keyed by tool root path

  // New project modal
  newProjectModalOpen: boolean;

  // Actions
  setProjectRoot: (root: string) => void;
  setFeatures: (features: FeatureNode[]) => void;
  selectFeature: (feature: FeatureNode) => void;
  updateEditorContent: (content: string) => void;
  saveFeature: () => Promise<void>;
  /** Set current feature content (e.g. after applying chat edits) without saving — file already written by backend. */
  setCurrentFeatureContent: (content: string) => void;
  toggleCodePeek: () => void;
  setCodePeekFiles: (files: Array<{ path: string; content: string }>) => void;
  appendChatMessage: (msg: ChatMessage) => void;
  setChatOpen: (open: boolean) => void;
  createChat: () => void;
  setActiveChat: (id: string | null) => void;
  deleteChat: (id: string) => void;
  /** Overwrite all chat sessions (used when loading persisted chats from disk). */
  setChatSessions: (sessions: ChatSession[]) => void;
  setGitBranch: (branch: string, branches: string[]) => void;
  appendRunOutput: (line: string, stderr?: boolean) => void;
  clearRunOutput: () => void;
  setRunOutputVisible: (visible: boolean) => void;
  setRunInProgress: (inProgress: boolean) => void;
  setAppMode: (mode: AppMode) => void;
  setTools: (tools: ToolEntry[]) => void;
  setToolConfig: (root: string, config: ToolConfig) => void;
  setNewProjectModalOpen: (open: boolean) => void;
  /** Reset all project-specific state and point at a new root. Called on project switch. */
  resetProjectState: (newRoot: string) => void;
}

const initialSession = createSession('Chat 1');
export const useVibeStore = create<VibeStore>((set, get) => ({
  projectRoot: null,
  features: [],
  selectedFeature: null,
  editorContent: '',
  isDirty: false,
  codePeekVisible: true,
  codePeekFiles: [],
  chatSessions: [initialSession],
  activeChatId: initialSession.id,
  chatOpen: false,
  currentBranch: 'main',
  branches: [],
  runOutputLines: [],
  runOutputVisible: true,
  runInProgress: false,
  appMode: 'editor',
  tools: [],
  toolConfigs: {},
  newProjectModalOpen: false,

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

  setCurrentFeatureContent: (content) =>
    set((s) => {
      if (!s.selectedFeature) return {};
      return {
        editorContent: content,
        isDirty: false,
        features: s.features.map((f) =>
          f.path === s.selectedFeature!.path ? { ...f, content } : f,
        ),
      };
    }),

  toggleCodePeek: () => set((s) => ({ codePeekVisible: !s.codePeekVisible })),
  setCodePeekFiles: (files) => set({ codePeekFiles: files }),
  appendChatMessage: (msg) =>
    set((s) => {
      const aid = s.activeChatId ?? s.chatSessions[0]?.id;
      if (!aid) {
        const newSession = createSession('Chat 1');
        newSession.messages.push(msg);
        return { chatSessions: [newSession], activeChatId: newSession.id };
      }
      const sessions = s.chatSessions.map((c) =>
        c.id === aid ? { ...c, messages: [...c.messages, msg] } : c,
      );
      // Optionally set title from first user message
      const updated = sessions.find((c) => c.id === aid);
      if (updated && msg.role === 'user' && updated.messages.length === 1) {
        const title = msg.content.slice(0, 32).trim() + (msg.content.length > 32 ? '…' : '');
        return {
          chatSessions: sessions.map((c) => (c.id === aid ? { ...c, title } : c)),
        };
      }
      return { chatSessions: sessions };
    }),
  setChatOpen: (open) => set({ chatOpen: open }),
  createChat: () =>
    set((s) => {
      const newSession = createSession(`Chat ${s.chatSessions.length + 1}`);
      return {
        chatSessions: [...s.chatSessions, newSession],
        activeChatId: newSession.id,
      };
    }),
  setActiveChat: (id) => set({ activeChatId: id }),
  deleteChat: (id) =>
    set((s) => {
      const sessions = s.chatSessions.filter((c) => c.id !== id);
      const nextActive =
        s.activeChatId === id
          ? sessions[0]?.id ?? null
          : s.activeChatId;
      return { chatSessions: sessions, activeChatId: nextActive };
    }),
  setChatSessions: (sessions) => {
    if (sessions.length === 0) return;
    set({ chatSessions: sessions, activeChatId: sessions[0].id });
  },
  setGitBranch: (branch, branches) => set({ currentBranch: branch, branches }),
  appendRunOutput: (line, stderr) =>
    set((s) => ({ runOutputLines: [...s.runOutputLines, { line, stderr }] })),
  clearRunOutput: () => set({ runOutputLines: [] }),
  setRunOutputVisible: (visible) => set({ runOutputVisible: visible }),
  setRunInProgress: (inProgress) => set({ runInProgress: inProgress }),
  setAppMode: (mode) => set({ appMode: mode }),
  setTools: (tools) => set({ tools }),
  setToolConfig: (root, config) =>
    set((s) => ({ toolConfigs: { ...s.toolConfigs, [root]: config } })),
  setNewProjectModalOpen: (open) => set({ newProjectModalOpen: open }),
  resetProjectState: (newRoot) => {
    const fresh = createSession('Chat 1');
    set({
      projectRoot: newRoot,
      features: [],
      selectedFeature: null,
      editorContent: '',
      isDirty: false,
      codePeekFiles: [],
      chatSessions: [fresh],
      activeChatId: fresh.id,
      currentBranch: 'main',
      branches: [],
      runOutputLines: [],
      runInProgress: false,
      appMode: 'editor',
    });
  },
}));
