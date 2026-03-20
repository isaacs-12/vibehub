/**
 * Vibehub Cloud Compile Agent
 *
 * A standalone worker that:
 *   1. Polls the web backend job queue  (GET  /api/agent/jobs/next)
 *   2. Runs an agentic compile loop     (vibes → working code)
 *   3. Writes results back              (PATCH /api/agent/jobs/:id)
 *
 * Deploy independently from the web backend — scale horizontally by running
 * multiple instances pointing at the same VIBEHUB_API_URL.
 *
 * Required env vars:
 *   VIBEHUB_API_URL   — base URL of the web backend (e.g. https://vibehub.app)
 *   AGENT_SECRET      — must match AGENT_SECRET on the web backend (optional in dev)
 *   AUTH_SECRET        — shared secret for decrypting user API keys (must match web backend)
 *
 * Optional env vars (fallback when job has no model config):
 *   AGENT_MODEL       — default generation model (default: claude-sonnet-4-6)
 *   AGENT_FAST_MODEL  — default validation model (default: same as AGENT_MODEL)
 *   ANTHROPIC_API_KEY — platform Anthropic key (used for free-tier jobs)
 *   GEMINI_API_KEY    — platform Google key (used for free-tier jobs)
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { runCompileJob, type CompileEvent, type ModelConfig } from './agent.ts';

const PORT = Number(process.env.PORT ?? 8080);
const API_URL = (process.env.VIBEHUB_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const AGENT_SECRET = process.env.AGENT_SECRET ?? '';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AGENT_SECRET) h['Authorization'] = `Bearer ${AGENT_SECRET}`;
  return h;
}

async function pollOnce() {
  const res = await fetch(`${API_URL}/api/agent/jobs/next`, { headers: headers() });
  if (res.status === 204) return; // queue empty
  if (!res.ok) {
    console.error(`[agent] poll failed: ${res.status} ${await res.text()}`);
    return;
  }

  const { job, pr } = await res.json() as {
    job: {
      id: string;
      prId: string;
      model?: string;
      fastModel?: string;
      provider?: string;
      apiKey?: string;
      keySource?: string;
    };
    pr: { intentDiff?: { headFeatures?: { path: string; content: string }[] } } | null;
  };

  console.log(`[agent] picked up job ${job.id} for PR ${job.prId} (model: ${job.model ?? 'default'})`);

  // Build model config from job — decrypt user API key if present
  const modelConfig: ModelConfig | undefined = job.model ? {
    generationModel: job.model,
    validationModel: job.fastModel ?? undefined,
    provider: job.provider,
    apiKey: job.apiKey && job.keySource === 'user' ? decryptApiKey(job.apiKey) : undefined,
  } : undefined;

  try {
    // Buffer events and flush to server periodically to avoid excessive requests
    let eventBuffer: Array<CompileEvent & { timestamp: string }> = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushEvents = async () => {
      if (eventBuffer.length === 0) return;
      const batch = eventBuffer;
      eventBuffer = [];
      try {
        await fetch(`${API_URL}/api/agent/jobs/${job.id}`, {
          method: 'PATCH',
          headers: headers(),
          body: JSON.stringify({ events: batch }),
        });
      } catch (err) {
        console.error(`[agent] failed to push events:`, err);
      }
    };

    const onProgress = (event: CompileEvent) => {
      console.log(`[agent] [${job.id}] ${event.type}`, 'slug' in event ? (event as any).slug : '');
      eventBuffer.push({ ...event, timestamp: new Date().toISOString() });
      // Flush every 2 seconds at most
      if (!flushTimer) {
        flushTimer = setTimeout(async () => {
          flushTimer = null;
          await flushEvents();
        }, 2000);
      }
    };

    const proofs = await runCompileJob(pr?.intentDiff?.headFeatures ?? [], onProgress, modelConfig);
    // Flush any remaining events before reporting completion
    if (flushTimer) clearTimeout(flushTimer);
    await flushEvents();
    await fetch(`${API_URL}/api/agent/jobs/${job.id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({
        status: 'completed',
        prId: job.prId,
        model: job.model ?? 'unknown',
        implementationProofs: proofs,
      }),
    });
    console.log(`[agent] job ${job.id} completed — ${proofs.length} file(s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agent] job ${job.id} failed: ${msg}`);
    await fetch(`${API_URL}/api/agent/jobs/${job.id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ status: 'failed', prId: job.prId, error: msg }),
    });
  }
}

/**
 * Decrypt a user API key that was encrypted by the web backend using AES-256-CBC.
 * Uses the same AUTH_SECRET as the web backend.
 */
function decryptApiKey(encrypted: string): string {
  const secret = process.env.AUTH_SECRET || 'dev-secret-do-not-use-in-prod';
  const key = crypto.createHash('sha256').update(secret).digest();
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes — must match web backend
const REAP_INTERVAL_MS = 60_000; // check for zombies every 60s
let lastReapTime = 0;

async function reapZombieJobs() {
  const now = Date.now();
  if (now - lastReapTime < REAP_INTERVAL_MS) return;
  lastReapTime = now;

  try {
    const cutoff = new Date(now - JOB_TIMEOUT_MS).toISOString();
    const res = await fetch(`${API_URL}/api/agent/jobs/reap`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ startedBefore: cutoff }),
    });
    if (res.ok) {
      const { reaped } = await res.json() as { reaped: number };
      if (reaped > 0) console.log(`[agent] reaped ${reaped} zombie job(s)`);
    }
  } catch (err) {
    console.error('[agent] reap error:', err);
  }
}

async function main() {
  // Cloud Run requires a listening port for health checks
  http.createServer((_req, res) => { res.writeHead(200); res.end('ok'); }).listen(PORT, () => {
    console.log(`[agent] health-check server on :${PORT}`);
  });

  console.log(`[agent] starting — polling ${API_URL} every ${POLL_INTERVAL_MS}ms`);
  while (true) {
    try {
      await reapZombieJobs();
      await pollOnce();
    } catch (err) {
      console.error('[agent] poll error:', err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main();
