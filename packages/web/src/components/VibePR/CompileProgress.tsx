'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, Cpu, FileCode, Wrench, TestTube2, Clock, Timer, Sparkles } from 'lucide-react';

const COMPILE_BUDGET_S = 12 * 60; // 12 minutes — matches agent budget

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

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function CompileProgress({ jobId, initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [events, setEvents] = useState<CompileJobEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const eventCountRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/jobs/${jobId}/status?after=${eventCountRef.current - 1}`);
      if (!res.ok) return;
      const data: StatusResponse = await res.json();
      setStatus(data.status);
      setError(data.error);
      if (data.startedAt) setStartedAt(data.startedAt);
      if (data.completedAt) setCompletedAt(data.completedAt);
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

  // Elapsed timer — ticks every second while running
  useEffect(() => {
    if (!startedAt) return;

    const start = new Date(startedAt).getTime();

    if (completedAt) {
      setElapsed(Math.floor((new Date(completedAt).getTime() - start) / 1000));
      return;
    }

    if (status === 'completed' || status === 'failed') return;

    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, completedAt, status]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [events.length]);

  if (status === 'completed' && events.length === 0) return null;

  const remaining = COMPILE_BUDGET_S - elapsed;
  const budgetPct = Math.min(100, (elapsed / COMPILE_BUDGET_S) * 100);
  const isRunning = status === 'running';
  const isTimedOut = error?.toLowerCase().includes('timed out');

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
            <span className="text-accent-emphasis font-medium">
              {events.some((e) => e.type === 'ideation_start') && !events.some((e) => e.type === 'compile_start')
                ? 'Designing features...'
                : 'Compiling...'}
            </span>
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
            <span className="text-red-400 font-medium">
              {isTimedOut ? 'Compilation timed out' : 'Compilation failed'}
            </span>
          </>
        )}

        {/* Timer — shown when started */}
        {startedAt && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-fg-subtle tabular-nums">
            <Clock size={12} />
            {formatElapsed(elapsed)}
            {isRunning && remaining > 0 && (
              <span className="text-fg-muted">/ {formatElapsed(COMPILE_BUDGET_S)}</span>
            )}
          </span>
        )}
      </div>

      {/* Progress bar — visible while running */}
      {isRunning && startedAt && (
        <div className="h-1 bg-canvas-subtle">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              budgetPct > 80 ? 'bg-yellow-400' : 'bg-accent-emphasis'
            }`}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
      )}

      {/* Timeout explanation */}
      {isTimedOut && (
        <div className="px-4 py-2 bg-red-950/20 border-b border-border text-xs text-red-300">
          <Timer size={11} className="inline mr-1.5 -mt-0.5" />
          Compilation exceeded the 12-minute time limit.
          {events.length > 0 && ' Partial results from completed features may still be available.'}
        </div>
      )}

      {/* Error detail (non-timeout) */}
      {error && !isTimedOut && (
        <div className="px-4 py-2 bg-red-950/20 border-b border-border text-xs text-red-300">
          {error}
        </div>
      )}

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
    case 'ideation_start':
      return (
        <div className="flex items-center gap-2 text-accent-emphasis">
          <Sparkles size={12} />
          <span>Decomposing description into feature specs...</span>
        </div>
      );
    case 'ideation_done':
      return (
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 size={12} />
          <span>
            Generated {event.featureCount as number} feature spec(s): {(event.features as string[])?.join(', ')}
          </span>
        </div>
      );
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
