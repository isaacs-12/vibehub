'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Key, Check, Loader2, Lock, Trash2, Shield, Cpu, Zap, Info } from 'lucide-react';

interface ModelDef {
  id: string;
  name: string;
  provider: string;
  tier: string;
  description: string;
  available: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

/** Client-side fallback when the preferences API is unavailable. */
const FALLBACK_MODELS: ModelDef[] = [
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google', tier: 'free', description: 'Best for simple, single-purpose apps', available: true },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', tier: 'free', description: 'Best for standard apps with basic logic', available: true },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'google', tier: 'byok', description: 'Builds smart apps with advanced features', available: false },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview', provider: 'google', tier: 'byok', description: 'Fastest way to build functional prototypes', available: false },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Preview', provider: 'google', tier: 'byok', description: 'Builds complex, professional-grade systems', available: false },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', tier: 'byok', description: 'Building polished, production-ready apps', available: false },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', tier: 'byok', description: 'Massive, complex apps with deep logic', available: false },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', tier: 'byok', description: 'Quick, versatile apps with great vision', available: false },
  { id: 'o3-mini', name: 'o3-mini', provider: 'openai', tier: 'byok', description: 'Heavy-duty apps requiring flawless logic', available: false },
];

export default function ProviderConfig() {
  const { data: session, status: authStatus } = useSession();
  const isLoggedIn = !!session?.user;

  const [models, setModels] = useState<ModelDef[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedFastModel, setSelectedFastModel] = useState<string | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // API key form
  const [keyProvider, setKeyProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    fetch('/api/user/preferences')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data) => {
        setModels(data.availableModels ?? []);
        setSelectedModel(data.preferredModel ?? '');
        setSelectedFastModel(data.preferredFastModel ?? null);
        setConfiguredProviders(data.hasApiKeys ?? {});
      })
      .catch(() => {
        // API unavailable or auth failed — show catalog with free-tier models available
        setModels(FALLBACK_MODELS);
      })
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  async function handleSave() {
    if (!selectedModel) return;
    setSaving(true);
    await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferredModel: selectedModel,
        preferredFastModel: selectedFastModel,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSaveKey() {
    if (!keyProvider || !keyInput.trim()) return;
    setSavingKey(true);
    await fetch('/api/user/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: keyProvider, apiKey: keyInput.trim() }),
    });
    setConfiguredProviders((prev) => ({ ...prev, [keyProvider]: true }));
    setModels((prev) => prev.map((m) => m.provider === keyProvider ? { ...m, available: true } : m));
    setKeyInput('');
    setKeyProvider(null);
    setSavingKey(false);
  }

  async function handleDeleteKey(provider: string) {
    await fetch('/api/user/api-keys', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    setConfiguredProviders((prev) => ({ ...prev, [provider]: false }));
    setModels((prev) => prev.map((m) => m.provider === provider ? { ...m, available: m.tier === 'free' } : m));
    const currentModel = models.find((m) => m.id === selectedModel);
    if (currentModel?.provider === provider && currentModel.tier === 'byok') {
      const fallback = models.find((m) => m.tier === 'free')?.id ?? '';
      setSelectedModel(fallback);
    }
    const currentFast = models.find((m) => m.id === selectedFastModel);
    if (currentFast?.provider === provider && currentFast.tier === 'byok') {
      setSelectedFastModel(null);
    }
  }

  if (authStatus === 'loading' || loading) {
    return (
      <section className="bg-canvas-subtle border border-border rounded-lg p-8 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-fg-muted" />
      </section>
    );
  }

  if (!isLoggedIn) {
    return (
      <section className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-fg text-sm">
            <Key size={14} />
            AI Model Configuration
          </div>
        </div>
        <div className="p-5 text-center">
          <Lock size={24} className="mx-auto text-fg-muted mb-2" />
          <p className="text-sm text-fg-muted mb-1">Sign in to configure your AI model</p>
          <p className="text-xs text-fg-subtle">
            Anonymous users compile with the free-tier model (Gemini 2.0 Flash Lite).
            Sign in to select better models or bring your own API keys.
          </p>
        </div>
      </section>
    );
  }

  const grouped = {
    free: models.filter((m) => m.tier === 'free'),
    byok: models.filter((m) => m.tier === 'byok'),
  };

  const uniqueByokProviders = [...new Set(grouped.byok.map((m) => m.provider))];

  const availableModels = models.filter((m) => m.available);
  const fastModelEffective = selectedFastModel ?? selectedModel;

  return (
    <section className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2 font-semibold text-fg text-sm">
          <Key size={14} />
          AI Model Configuration
        </div>
        <p className="text-xs text-fg-muted mt-1">
          Choose the models used for Vibe-to-Code compilation. Bring your own API keys to unlock premium models.
        </p>
      </div>

      <div className="p-5 space-y-6">
        {/* API Keys section */}
        <div>
          <label className="block text-xs text-fg-muted mb-2 uppercase tracking-wide font-medium">Your API Keys</label>
          <div className="space-y-2">
            {uniqueByokProviders.map((provider) => (
              <div key={provider} className="flex items-center justify-between px-3 py-2 border border-border rounded-md">
                <div className="flex items-center gap-2">
                  <Shield size={12} className={configuredProviders[provider] ? 'text-success' : 'text-fg-subtle'} />
                  <span className="text-sm text-fg">{PROVIDER_LABELS[provider] ?? provider}</span>
                  {configuredProviders[provider] && (
                    <span className="text-[10px] bg-success/10 text-success border border-success/20 px-1.5 py-0.5 rounded">
                      configured
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {configuredProviders[provider] ? (
                    <button
                      onClick={() => handleDeleteKey(provider)}
                      className="p-1.5 text-fg-subtle hover:text-red-400 transition-colors"
                      title="Remove key"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                  <button
                    onClick={() => { setKeyProvider(keyProvider === provider ? null : provider); setKeyInput(''); }}
                    className="px-2 py-1 text-xs text-accent-emphasis hover:bg-accent-subtle rounded transition-colors"
                  >
                    {configuredProviders[provider] ? 'Update' : 'Add key'}
                  </button>
                </div>
              </div>
            ))}

            {keyProvider && (
              <div className="mt-2 p-3 border border-accent/30 rounded-md bg-canvas space-y-2">
                <label className="block text-xs text-fg-muted">
                  {PROVIDER_LABELS[keyProvider]} API Key
                </label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={keyProvider === 'google' ? 'AIza…' : keyProvider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                  className="w-full bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent/50 placeholder:text-fg-subtle"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setKeyProvider(null); setKeyInput(''); }}
                    className="px-3 py-1 text-xs text-fg-muted hover:text-fg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveKey}
                    disabled={!keyInput.trim() || savingKey}
                    className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-40 transition-colors"
                  >
                    {savingKey ? 'Saving…' : 'Save Key'}
                  </button>
                </div>
                <p className="text-[10px] text-fg-subtle">
                  Your key is encrypted at rest and only used for your compilations. We never log or share it.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Generation model ── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu size={13} className="text-accent-emphasis" />
            <label className="text-xs text-fg-muted uppercase tracking-wide font-medium">Generation Model</label>
          </div>
          <p className="text-[11px] text-fg-subtle mb-3">
            The primary model that writes your code. Smarter models produce better code but cost more and take longer.
          </p>
          <div className="space-y-1.5">
            {grouped.free.map((m) => (
              <ModelButton key={m.id} model={m} selected={selectedModel === m.id} onSelect={setSelectedModel} />
            ))}
            {grouped.byok.map((m) => (
              <ModelButton key={m.id} model={m} selected={selectedModel === m.id} onSelect={setSelectedModel} locked={!m.available} />
            ))}
          </div>
        </div>

        {/* ── Validation model ── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={13} className="text-yellow-500" />
            <label className="text-xs text-fg-muted uppercase tracking-wide font-medium">Validation Model</label>
            <span className="text-[10px] text-fg-subtle">(optional)</span>
          </div>
          <p className="text-[11px] text-fg-subtle mb-3">
            A second model that reviews the generated code, runs builds and tests, and fixes errors.
            Using a faster, cheaper model here saves cost without sacrificing code quality — the hard thinking is already done.
          </p>

          {/* "Same as generation" option */}
          <div className="space-y-1.5">
            <button
              onClick={() => setSelectedFastModel(null)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors ${
                selectedFastModel === null
                  ? 'border-accent bg-accent-subtle text-fg'
                  : 'border-border hover:border-fg/20 text-fg-muted'
              }`}
            >
              <span className="flex items-center gap-2">
                {selectedFastModel === null && <Check size={12} className="text-accent-emphasis" />}
                {selectedFastModel !== null && <span className="w-3" />}
                Same as generation model
              </span>
              <span className="text-[10px] text-fg-subtle">Uses {models.find((m) => m.id === selectedModel)?.name ?? selectedModel} for both</span>
            </button>
            {availableModels.map((m) => (
              <ModelButton key={m.id} model={m} selected={selectedFastModel === m.id} onSelect={setSelectedFastModel} />
            ))}
          </div>
        </div>

        {/* Summary hint */}
        {selectedModel && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-canvas border border-border rounded-md">
            <Info size={13} className="text-fg-subtle mt-0.5 shrink-0" />
            <p className="text-[11px] text-fg-muted leading-relaxed">
              <strong className="text-fg">{models.find((m) => m.id === selectedModel)?.name ?? selectedModel}</strong> writes your code
              {fastModelEffective !== selectedModel ? (
                <>, then <strong className="text-fg">{models.find((m) => m.id === fastModelEffective)?.name ?? fastModelEffective}</strong> validates and fixes errors. This saves cost on the iterative fix loop.</>
              ) : (
                <> and validates it. To reduce cost, pick a faster model for validation above.</>
              )}
            </p>
          </div>
        )}

        {/* Save button */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-[10px] text-fg-subtle">
            Changes apply to your next compilation.
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 disabled:opacity-40 transition-colors"
          >
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ModelButton({ model, selected, onSelect, locked }: {
  model: ModelDef;
  selected: boolean;
  onSelect: (id: string) => void;
  locked?: boolean;
}) {
  return (
    <button
      onClick={() => !locked && onSelect(model.id)}
      disabled={locked}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors ${
        selected
          ? 'border-accent bg-accent-subtle text-fg'
          : locked
          ? 'border-border text-fg-subtle cursor-not-allowed opacity-60'
          : 'border-border hover:border-fg/20 text-fg-muted'
      }`}
    >
      <span className="flex items-center gap-2">
        {selected && <Check size={12} className="text-accent-emphasis" />}
        {!selected && (locked ? <Lock size={12} /> : <span className="w-3" />)}
        {model.name}
        <span className="text-xs text-fg-subtle">({PROVIDER_LABELS[model.provider] ?? model.provider})</span>
      </span>
      <span className="text-[10px] text-fg-subtle">{model.description}</span>
    </button>
  );
}
