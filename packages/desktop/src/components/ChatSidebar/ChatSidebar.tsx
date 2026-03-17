import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bot, Plus, Trash2, Check, Plug } from 'lucide-react';
import { useVibeStore, type ChatMessage, type ChatAction } from '../../store/index.ts';
import IntegrationSetup from '../IntegrationSetup/IntegrationSetup.tsx';

export default function ChatSidebar() {
  const {
    setChatOpen,
    chatSessions,
    activeChatId,
    setActiveChat,
    createChat,
    deleteChat,
    appendChatMessage,
    selectedFeature,
    editorContent,
    projectRoot,
    setCurrentFeatureContent,
    setFeatures,
  } = useVibeStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat =
    chatSessions.find((s) => s.id === activeChatId) ?? chatSessions[0] ?? null;
  const chatMessages = activeChat?.messages ?? [];
  const lastAssistantMessage = chatMessages.filter((m) => m.role === 'assistant').pop();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Persist chats to .vibe/chats.json whenever sessions change, debounced 1 second.
  useEffect(() => {
    if (!projectRoot) return;
    const timer = setTimeout(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_chats', { root: projectRoot, sessionsJson: JSON.stringify(chatSessions) });
      } catch { /* best-effort */ }
    }, 1000);
    return () => clearTimeout(timer);
  }, [chatSessions, projectRoot]);

  async function send() {
    if (!input.trim() || loading) return;
    if (!projectRoot) {
      appendChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Open a project first (top bar → Open Project) so chat has a project root.',
      });
      return;
    }
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      vibeContext: selectedFeature?.name,
    };
    appendChatMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const raw = await invoke<string>('chat_with_vibes', {
        root: projectRoot,
        userMessage: input,
        vibeContext: editorContent,
        featureName: selectedFeature?.name ?? '',
        history: chatMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      });
      const { content, actions } = parseActions(raw);
      appendChatMessage({ id: crypto.randomUUID(), role: 'assistant', content, actions });
    } catch (err) {
      appendChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function applyToFile() {
    if (!selectedFeature || !projectRoot || !lastAssistantMessage || applying) return;
    setApplying(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const newContent = await invoke<string>('apply_chat_to_vibe_file', {
        root: projectRoot,
        featureName: selectedFeature.name,
        currentContent: editorContent,
        lastAssistantMessage: lastAssistantMessage.content,
      });
      setCurrentFeatureContent(newContent);
    } catch (err) {
      appendChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Apply failed: ${String(err)}`,
      });
    } finally {
      setApplying(false);
    }
  }

  async function createFeature(name: string, assistantContent: string) {
    if (!projectRoot) return;
    // Extract the fenced code block for this feature from the assistant message.
    // Looks for **name** or **name.vibe** or **name.md** followed by ```markdown ... ```
    const escaped = name.replace(/[-]/g, '[-]');
    const blockRe = new RegExp(
      `\\*\\*${escaped}(?:\\.vibe|\\.md)?\\*\\*[^\\n]*\\n\`\`\`(?:markdown)?\\n([\\s\\S]*?)\`\`\``,
      'i',
    );
    const match = assistantContent.match(blockRe);
    const content = match?.[1]?.trim() ?? '';
    if (!content) {
      appendChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Couldn't extract content for "${name}" from the response. Ask me to show the full file again.`,
      });
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_vibe_file', {
        root: projectRoot,
        relativePath: `.vibe/features/${name}.md`,
        content,
      });
      // Refresh sidebar so the new file appears immediately
      const raw = await invoke<Array<{ name: string; path: string; content: string }>>(
        'list_vibe_features', { root: projectRoot },
      );
      setFeatures(raw.map((f) => ({ name: f.name, path: f.path, content: f.content })));
      appendChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Created .vibe/features/${name}.md`,
      });
    } catch (err) {
      appendChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Failed to create ${name}: ${String(err)}`,
      });
    }
  }

  function handleAction(action: ChatAction) {
    if (action.type === 'reply') {
      setInput(action.text);
    } else if (action.type === 'apply') {
      applyToFile();
    } else if (action.type === 'create_feature') {
      const content = lastAssistantMessage?.content ?? '';
      createFeature(action.name, content);
    } else if (action.type === 'integration') {
      setIntegrationOpen(true);
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-overlay w-96">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Bot size={15} className="text-accent-light" />
          Vibe Chat
        </div>
        {selectedFeature && (
          <span className="text-xs text-muted bg-surface px-2 py-0.5 rounded">
            @{selectedFeature.name}
          </span>
        )}
        <button onClick={() => setChatOpen(false)} className="text-muted hover:text-gray-200">
          <X size={14} />
        </button>
      </div>

      {/* Tabs (browser-style, top) */}
      <div className="flex items-end border-b border-surface-border shrink-0 overflow-x-auto min-h-0">
        <button
          type="button"
          onClick={createChat}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted hover:text-gray-200 hover:bg-surface border-b-2 border-transparent shrink-0"
          title="New chat"
        >
          <Plus size={12} />
          New
        </button>
        {chatSessions.map((session) => (
          <div
            key={session.id}
            className={`group flex items-center gap-0.5 shrink-0 border-b-2 transition-colors ${
              session.id === activeChatId
                ? 'border-accent bg-surface-raised text-accent-light'
                : 'border-transparent text-muted hover:text-gray-200 hover:bg-surface/50'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveChat(session.id)}
              className="max-w-[140px] truncate px-2.5 py-1.5 text-xs text-left"
              title={session.title}
            >
              {session.title}
            </button>
            {chatSessions.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); deleteChat(session.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-danger transition-opacity shrink-0"
                title="Close chat"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Message area (full width) */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
          {chatMessages.length === 0 && (
            <div className="text-xs text-muted text-center py-8 px-2">
              {projectRoot
                ? 'Ask anything about your features. I have full context of your current Vibe file.'
                : 'Open a project (top bar → Open Project) to use chat.'}
            </div>
          )}
          {chatMessages.map((msg) => (
            <ChatBubble key={msg.id} msg={msg} onAction={handleAction} />
          ))}
          {loading && (
            <div className="flex gap-2 text-xs text-muted">
              <Loader2 size={14} className="animate-spin mt-0.5 shrink-0" />
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Context badge + Apply */}
        {selectedFeature && (
          <div className="px-4 py-1.5 border-t border-surface-border bg-surface text-xs text-muted shrink-0 flex items-center justify-between gap-2">
            <span>
              Context: <span className="text-accent-light">{selectedFeature.name}.md</span> + mapped code
            </span>
            {lastAssistantMessage && (
              <button
                type="button"
                onClick={applyToFile}
                disabled={applying}
                className="flex items-center gap-1 px-2 py-1 rounded bg-accent/20 text-accent-light hover:bg-accent/30 disabled:opacity-50 transition-colors"
              >
                {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Apply to file
              </button>
            )}
          </div>
        )}

        {/* Integration setup panel */}
        {integrationOpen && projectRoot && (
          <IntegrationSetup
            projectRoot={projectRoot}
            onClose={() => setIntegrationOpen(false)}
            onSaved={(serviceName) => {
              setIntegrationOpen(false);
              appendChatMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Integration saved to .vibe/integrations/${serviceName}.md. Add \`Connects: [${serviceName}]\` to any feature that uses it.`,
              });
            }}
          />
        )}

        {/* Input */}
        <div className="p-3 border-t border-surface-border shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={projectRoot ? 'Ask about features, request changes…' : 'Open a project first…'}
              rows={3}
              disabled={!projectRoot}
              className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent placeholder:text-muted disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
            />
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => setIntegrationOpen((v) => !v)}
                disabled={!projectRoot}
                title="Generate integration"
                className={`p-2 rounded transition-colors disabled:opacity-40 ${integrationOpen ? 'bg-accent text-white' : 'bg-surface-raised text-muted hover:text-gray-200 border border-surface-border'}`}
              >
                <Plug size={14} />
              </button>
              <button
                onClick={send}
                disabled={loading || !input.trim() || !projectRoot}
                className="p-2 bg-accent hover:bg-accent/80 disabled:opacity-40 rounded text-white transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseActions(raw: string): { content: string; actions: ChatAction[] } {
  const sep = '---actions---';
  const idx = raw.lastIndexOf(sep);
  if (idx === -1) return { content: raw.trim(), actions: [] };
  const content = raw.slice(0, idx).trim();
  try {
    const actions = JSON.parse(raw.slice(idx + sep.length).trim()) as ChatAction[];
    return { content, actions: Array.isArray(actions) ? actions : [] };
  } catch {
    return { content, actions: [] };
  }
}

function ChatBubble({ msg, onAction }: { msg: ChatMessage; onAction: (a: ChatAction) => void }) {
  return (
    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed select-text ${
          msg.role === 'user'
            ? 'bg-accent/30 text-gray-100 rounded-br-none'
            : 'bg-surface-raised text-gray-200 rounded-bl-none border border-surface-border'
        }`}
      >
        {msg.content}
      </div>
      {msg.actions && msg.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[85%]">
          {msg.actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onAction(action)}
              className="px-2.5 py-1 text-xs rounded-full border border-accent/40 text-accent-light hover:bg-accent/20 hover:border-accent transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
