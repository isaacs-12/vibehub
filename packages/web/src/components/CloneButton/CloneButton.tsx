'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Copy, Check, Terminal } from 'lucide-react';

interface Props {
  owner: string;
  repo: string;
}

export default function CloneButton({ owner, repo }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const command = `vibe clone ${owner}/${repo}`;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleCopy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-canvas-subtle transition-colors"
      >
        <Terminal size={14} />
        Clone
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-canvas border border-border rounded-lg shadow-xl z-50 p-3">
          <p className="text-xs text-fg-muted mb-2">
            Clone this project to edit locally in Vibe Studio:
          </p>
          <div className="flex items-center gap-2 bg-canvas-subtle border border-border rounded-md px-3 py-2">
            <code className="text-xs text-accent-emphasis font-mono flex-1 truncate">
              {command}
            </code>
            <button
              onClick={handleCopy}
              className="text-fg-muted hover:text-fg transition-colors shrink-0"
              title="Copy"
            >
              {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            </button>
          </div>
          <p className="text-[11px] text-fg-subtle mt-2">
            Creates <code className="bg-canvas px-0.5 rounded">{owner}-{repo}/</code> with{' '}
            <code className="bg-canvas px-0.5 rounded">.vibe/</code> pre-configured.
          </p>
        </div>
      )}
    </div>
  );
}
