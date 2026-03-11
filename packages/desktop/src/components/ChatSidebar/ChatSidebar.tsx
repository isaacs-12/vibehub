import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bot } from 'lucide-react';
import { useVibeStore, type ChatMessage } from '../../store/index.ts';

export default function ChatSidebar() {
  const { setChatOpen, chatMessages, appendChatMessage, selectedFeature, editorContent, projectRoot } =
    useVibeStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function send() {
    if (!input.trim() || loading) return;
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
    <div className="flex flex-col h-full bg-surface-overlay">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="text-xs text-muted text-center py-8">
            Ask anything about your features. I have full context of your current Vibe file.
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
        <div className="px-4 py-1.5 border-t border-surface-border bg-surface text-xs text-muted">
          Context: <span className="text-accent-light">{selectedFeature.name}.md</span> + mapped code
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-surface-border">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask about features, request changes…"
            rows={3}
            className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent placeholder:text-muted"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="p-2 bg-accent hover:bg-accent/80 disabled:opacity-40 rounded text-white transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
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
