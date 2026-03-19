'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Key, Check, Loader2, Lock, Trash2, Shield } from 'lucide-react';

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

export default function ProviderConfig() {
  const { data: session, status: authStatus } = useSession();
  const isLoggedIn = !!session?.user;

  const [models, setModels] = useState<ModelDef[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
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
      .then((r) => r.json())
      .then((data) => {
        setModels(data.availableModels ?? []);
        setSelectedModel(data.preferredModel ?? '');
        setConfiguredProviders(data.hasApiKeys ?? {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  async function handleSaveModel() {
    if (!selectedModel) return;
    setSaving(true);
    await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredModel: selectedModel }),
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
    // Update available models
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
    // If user's selected model is from this provider and BYOK, reset to default
    const currentModel = models.find((m) => m.id === selectedModel);
    if (currentModel?.provider === provider && currentModel.tier === 'byok') {
      const fallback = models.find((m) => m.tier === 'free')?.id ?? '';
      setSelectedModel(fallback);
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

  return (
    <section className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2 font-semibold text-fg text-sm">
          <Key size={14} />
          AI Model Configuration
        </div>
        <p className="text-xs text-fg-muted mt-1">
          Choose the model used for Vibe-to-Code compilation. Bring your own API keys to unlock premium models.
        </p>
      </div>

      <div className="p-5 space-y-6">
        {/* Free tier models */}
        <div>
          <label className="block text-xs text-fg-muted mb-2 uppercase tracking-wide font-medium">Free Tier</label>
          <div className="space-y-2">
            {grouped.free.map((m) => (
              <ModelButton key={m.id} model={m} selected={selectedModel === m.id} onSelect={setSelectedModel} />
            ))}
          </div>
        </div>

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

            {/* Key input form */}
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

        {/* BYOK models */}
        {grouped.byok.length > 0 && (
          <div>
            <label className="block text-xs text-fg-muted mb-2 uppercase tracking-wide font-medium">
              Premium Models (Bring Your Own Key)
            </label>
            <div className="space-y-2">
              {grouped.byok.map((m) => (
                <ModelButton
                  key={m.id}
                  model={m}
                  selected={selectedModel === m.id}
                  onSelect={setSelectedModel}
                  locked={!m.available}
                />
              ))}
            </div>
          </div>
        )}

        {/* Save button */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-[10px] text-fg-subtle">
            Changes apply to your next compilation.
          </p>
          <button
            onClick={handleSaveModel}
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
