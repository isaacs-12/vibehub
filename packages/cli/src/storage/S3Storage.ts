import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { StorageProvider } from '../types.js';

/**
 * S3Storage — production implementation of StorageProvider.
 *
 * All paths are stored as S3 object keys under a configurable key prefix.
 * Set the following env vars (or pass via constructor options):
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */
export interface S3StorageOptions {
  bucket: string;
  /** Optional prefix (project namespace), e.g. "projects/my-project" */
  prefix?: string;
  region?: string;
}

export class S3Storage implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor({ bucket, prefix = '', region = process.env.AWS_REGION ?? 'us-east-1' }: S3StorageOptions) {
    this.client = new S3Client({ region });
    this.bucket = bucket;
    this.prefix = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
  }

  async read(relativePath: string): Promise<string> {
    const key = this.key(relativePath);
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const res = await this.client.send(cmd);
    if (!res.Body) throw new Error(`S3Storage.read: empty body for key "${key}"`);
    return res.Body.transformToString('utf-8');
  }

  async write(relativePath: string, content: string): Promise<void> {
    const key = this.key(relativePath);
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentType: 'text/plain; charset=utf-8',
    });
    await this.client.send(cmd);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const cmd = new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(relativePath) });
      await this.client.send(cmd);
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const fullPrefix = this.key(prefix.endsWith('/') ? prefix : `${prefix}/`);
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const cmd = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: fullPrefix,
        ContinuationToken: continuationToken,
      });
      const res = await this.client.send(cmd);
      for (const obj of res.Contents ?? []) {
        if (obj.Key) {
          // Return paths relative to this.prefix so they match FileSystemStorage
          keys.push(obj.Key.slice(this.prefix.length));
        }
      }
      continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  private key(relativePath: string): string {
    return `${this.prefix}${relativePath}`;
  }
}
