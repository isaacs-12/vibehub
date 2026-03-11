import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bot, Plus, MessageSquare, Trash2 } from 'lucide-react';
import { useVibeStore, type ChatMessage } from '../../store/index.ts';

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
  } = useVibeStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat =
    chatSessions.find((s) => s.id === activeChatId) ?? chatSessions[0] ?? null;
  const chatMessages = activeChat?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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
      const response = await invoke<string>('chat_with_vibes', {
        root: projectRoot,
        userMessage: input,
        vibeContext: editorContent,
        featureName: selectedFeature?.name ?? '',
        history: chatMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      });
      appendChatMessage({ id: crypto.randomUUID(), role: 'assistant', content: response });
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

      {/* Chat list + messages */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Session list */}
        <div className="w-28 shrink-0 border-r border-surface-border flex flex-col py-2">
          <button
            type="button"
            onClick={createChat}
            className="mx-2 mb-2 flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted hover:text-gray-200 hover:bg-surface rounded transition-colors"
          >
            <Plus size={12} />
            New chat
          </button>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {chatSessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center gap-1 px-2 py-1.5 mx-1 rounded cursor-pointer transition-colors ${
                  session.id === activeChatId
                    ? 'bg-accent/20 text-accent-light'
                    : 'text-muted hover:bg-surface hover:text-gray-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveChat(session.id)}
                  className="flex-1 min-w-0 text-left text-xs truncate"
                  title={session.title}
                >
                  <MessageSquare size={10} className="shrink-0 inline mr-1 opacity-70" />
                  {session.title}
                </button>
                {chatSessions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteChat(session.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted hover:text-danger transition-opacity"
                    title="Delete chat"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Message area */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
            {chatMessages.length === 0 && (
              <div className="text-xs text-muted text-center py-8 px-2">
                {projectRoot
                  ? 'Ask anything about your features. I have full context of your current Vibe file.'
                  : 'Open a project (top bar → Open Project) to use chat.'}
              </div>
            )}
            {chatMessages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} />
            ))}
            {loading && (
              <div className="flex gap-2 text-xs text-muted">
                <Loader2 size={14} className="animate-spin mt-0.5 shrink-0" />
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Context badge */}
          {selectedFeature && (
            <div className="px-4 py-1.5 border-t border-surface-border bg-surface text-xs text-muted shrink-0">
              Context: <span className="text-accent-light">{selectedFeature.name}.md</span> + mapped code
            </div>
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
              <button
                onClick={send}
                disabled={loading || !input.trim() || !projectRoot}
                className="p-2 bg-accent hover:bg-accent/80 disabled:opacity-40 rounded text-white transition-colors shrink-0"
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

function ChatBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed select-text ${
          msg.role === 'user'
            ? 'bg-accent/30 text-gray-100 rounded-br-none'
            : 'bg-surface-raised text-gray-200 rounded-bl-none border border-surface-border'
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}
