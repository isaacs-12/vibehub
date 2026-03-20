/**
 * Artifact storage abstraction.
 *
 * Uses Google Cloud Storage via the @google-cloud/storage SDK.
 * Falls back to filesystem storage when GCS_BUCKET is not set (local dev).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const BUCKET = process.env.GCS_BUCKET ?? '';

// Lazy-loaded GCS client — only imported when BUCKET is set
async function getGCSBucket() {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  return storage.bucket(BUCKET);
}

// Local filesystem fallback for development
function localArtifactPath(key: string): string {
  const dir = process.env.VIBEHUB_DATA_DIR
    ? path.join(process.env.VIBEHUB_DATA_DIR, 'artifacts')
    : path.join(os.homedir(), '.vibehub', 'artifacts');
  const fullPath = path.join(dir, key);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  return fullPath;
}

/** Store a vibe artifact (feature Markdown, requirements YAML, compiled code). */
export async function putArtifact(key: string, body: string): Promise<void> {
  if (BUCKET) {
    const bucket = await getGCSBucket();
    await bucket.file(key).save(body, { contentType: 'text/plain; charset=utf-8' });
  } else {
    fs.writeFileSync(localArtifactPath(key), body, 'utf8');
  }
}

/** Retrieve a vibe artifact. Returns null if not found. */
export async function getArtifact(key: string): Promise<string | null> {
  try {
    if (BUCKET) {
      const bucket = await getGCSBucket();
      const [contents] = await bucket.file(key).download();
      return contents.toString('utf-8');
    } else {
      const p = localArtifactPath(key);
      if (!fs.existsSync(p)) return null;
      return fs.readFileSync(p, 'utf8');
    }
  } catch {
    return null;
  }
}

/** List all artifact keys under a prefix. */
export async function listArtifacts(prefix: string): Promise<string[]> {
  if (BUCKET) {
    const bucket = await getGCSBucket();
    const [files] = await bucket.getFiles({ prefix });
    return files.map((f) => f.name);
  } else {
    const dir = localArtifactPath(prefix);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map((f) => path.join(prefix, f));
  }
}

/** Delete an artifact. */
export async function deleteArtifact(key: string): Promise<void> {
  try {
    if (BUCKET) {
      const bucket = await getGCSBucket();
      await bucket.file(key).delete();
    } else {
      const p = localArtifactPath(key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch {
    // ignore not-found
  }
}
