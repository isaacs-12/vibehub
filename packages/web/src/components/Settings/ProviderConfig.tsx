'use client';

import React, { useState } from 'react';
import { Key, ChevronDown, Check } from 'lucide-react';

const PROVIDERS = [
  { id: 'gemini-flash', name: 'Gemini 1.5 Flash', vendor: 'Google', recommended: true },
  { id: 'gemini-pro', name: 'Gemini 1.5 Pro', vendor: 'Google', recommended: false },
  { id: 'claude-sonnet', name: 'Claude 3.5 Sonnet', vendor: 'Anthropic', recommended: false },
  { id: 'gpt-4o', name: 'GPT-4o', vendor: 'OpenAI', recommended: false },
  { id: 'local-ollama', name: 'Local (Ollama)', vendor: 'Self-hosted', recommended: false },
];

export default function ProviderConfig() {
  const [selected, setSelected] = useState('gemini-flash');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    // In production: POST /api/settings/provider
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2 font-semibold text-fg text-sm">
          <Key size={14} />
          AI Provider Configuration
        </div>
        <p className="text-xs text-fg-muted mt-1">
          Choose the model used for Vibe-to-Code compilation and the agentic chat.
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Provider selector */}
        <div>
          <label className="block text-xs text-fg-muted mb-1.5">Vibe-to-Code Model</label>
          <div className="space-y-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors ${
                  selected === p.id
                    ? 'border-accent bg-accent-subtle text-fg'
                    : 'border-border hover:border-fg/20 text-fg-muted'
                }`}
              >
                <span className="flex items-center gap-2">
                  {selected === p.id && <Check size={12} className="text-accent-emphasis" />}
                  {selected !== p.id && <span className="w-3" />}
                  {p.name}
                  <span className="text-xs text-fg-subtle">({p.vendor})</span>
                  {p.recommended && (
                    <span className="text-xs bg-success/10 text-success border border-success/20 px-1.5 py-0.5 rounded">
                      recommended
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* API key */}
        {selected !== 'local-ollama' && (
          <div>
            <label className="block text-xs text-fg-muted mb-1.5">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-… or AIza…"
              className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent/50 placeholder:text-fg-subtle"
            />
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition-colors"
          >
            {saved ? '✓ Saved' : 'Save Provider Settings'}
          </button>
        </div>
      </div>
    </section>
  );
}
