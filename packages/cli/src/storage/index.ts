export { FileSystemStorage } from './FileSystemStorage.js';
export { S3Storage } from './S3Storage.js';
export type { S3StorageOptions } from './S3Storage.js';

/**
 * Factory that selects the right StorageProvider based on the environment.
 *
 * Usage:
 *   const storage = createStorage({ rootPath: '/path/to/repo' });
 *
 * Set VIBEHUB_STORAGE=s3 plus S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY in production.
 */
import { FileSystemStorage } from './FileSystemStorage.js';
import { S3Storage } from './S3Storage.js';
import type { StorageProvider } from '../types.js';

export function createStorage(opts: { rootPath: string; prefix?: string }): StorageProvider {
  const driver = process.env.VIBEHUB_STORAGE ?? 'filesystem';

  if (driver === 's3') {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET env var required when VIBEHUB_STORAGE=s3');
    return new S3Storage({ bucket, prefix: opts.prefix });
  }

  return new FileSystemStorage(opts.rootPath);
}
