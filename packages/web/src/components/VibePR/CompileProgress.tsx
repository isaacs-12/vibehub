'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, Cpu, FileCode, Wrench, TestTube2 } from 'lucide-react';

interface CompileJobEvent {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

interface StatusResponse {
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  events: CompileJobEvent[];
  eventCount: number;
}

interface Props {
  jobId: string;
  initialStatus: string;
}

export default function CompileProgress({ jobId, initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [events, setEvents] = useState<CompileJobEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventCountRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/jobs/${jobId}/status?after=${eventCountRef.current - 1}`);
      if (!res.ok) return;
      const data: StatusResponse = await res.json();
      setStatus(data.status);
      setError(data.error);
      if (data.events.length > 0) {
        setEvents((prev) => [...prev, ...data.events]);
        eventCountRef.current = data.eventCount;
      }
    } catch {
      // Silently retry on next poll
    }
  }, [jobId]);

  useEffect(() => {
    if (status === 'completed' || status === 'failed') return;

    // Initial fetch
    poll();

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [status, poll]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [events.length]);

  if (status === 'completed' && events.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-canvas-subtle border-b border-border text-sm">
        {status === 'pending' && (
          <>
            <Loader2 size={14} className="animate-spin text-fg-muted" />
            <span className="text-fg-muted">Queued for compilation...</span>
          </>
        )}
        {status === 'running' && (
          <>
            <Loader2 size={14} className="animate-spin text-accent-emphasis" />
            <span className="text-accent-emphasis font-medium">Compiling...</span>
          </>
        )}
        {status === 'completed' && (
          <>
            <CheckCircle2 size={14} className="text-success" />
            <span className="text-success font-medium">Compilation complete</span>
          </>
        )}
        {status === 'failed' && (
          <>
            <XCircle size={14} className="text-red-400" />
            <span className="text-red-400 font-medium">Compilation failed</span>
            {error && <span className="text-xs text-fg-muted ml-2">{error}</span>}
          </>
        )}
      </div>

      {/* Event log */}
      {events.length > 0 && (
        <div ref={scrollRef} className="max-h-64 overflow-y-auto p-3 space-y-1 bg-canvas-inset text-xs font-mono">
          {events.map((event, i) => (
            <EventLine key={i} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventLine({ event }: { event: CompileJobEvent }) {
  const slug = (event.slug as string) ?? '';

  switch (event.type) {
    case 'compile_start':
      return (
        <div className="flex items-center gap-2 text-fg-muted">
          <Cpu size={12} />
          <span>
            Starting compilation of {(event.features as string[])?.length ?? 0} feature(s)
            {event.generationModel ? (
              <span className="text-fg-subtle"> — model: {String(event.generationModel)}</span>
            ) : null}
          </span>
        </div>
      );
    case 'feature_start':
      return (
        <div className="flex items-center gap-2 text-fg font-medium mt-2">
          <FileCode size={12} />
          <span>Feature {(event.index as number) + 1}/{event.total as number}: {slug}</span>
        </div>
      );
    case 'phase1_start':
      return (
        <div className="flex items-center gap-2 text-accent-emphasis pl-4">
          <Wrench size={11} />
          <span>Phase 1: Code generation</span>
        </div>
      );
    case 'phase1_tool':
      return (
        <div className="pl-8 text-fg-subtle">
          {event.tool as string}: {event.detail as string}
        </div>
      );
    case 'phase1_done':
      return (
        <div className="flex items-center gap-2 text-success pl-4">
          <CheckCircle2 size={11} />
          <span>Generation complete — {event.fileCount as number} file(s)</span>
        </div>
      );
    case 'phase2_start':
      return (
        <div className="flex items-center gap-2 text-accent-emphasis pl-4">
          <TestTube2 size={11} />
          <span>Phase 2: Validation & fixing</span>
        </div>
      );
    case 'phase2_iteration':
      return (
        <div className="pl-8 text-fg-subtle">
          Iteration {event.iteration as number}: {(event.tools as string[])?.join(', ')}
        </div>
      );
    case 'phase2_done':
      return (
        <div className="flex items-center gap-2 text-success pl-4">
          <CheckCircle2 size={11} />
          <span>Validation complete — {event.fileCount as number} file(s)</span>
        </div>
      );
    case 'feature_done':
      return (
        <div className="flex items-center gap-2 text-success pl-2">
          <CheckCircle2 size={12} />
          <span>{slug} done — {event.fileCount as number} total file(s)</span>
        </div>
      );
    case 'compile_done':
      return (
        <div className="flex items-center gap-2 text-success font-medium mt-2">
          <CheckCircle2 size={12} />
          <span>All done — {event.totalFiles as number} file(s) across {event.features as number} feature(s)</span>
        </div>
      );
    default:
      return (
        <div className="text-fg-subtle pl-4">{String(event.type)}</div>
      );
  }
}
