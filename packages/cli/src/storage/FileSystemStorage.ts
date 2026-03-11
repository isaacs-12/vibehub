import path from 'path';
import fs from 'fs-extra';
import { glob } from 'glob';
import type { StorageProvider } from '../types.js';

/**
 * FileSystemStorage — local-dev implementation of StorageProvider.
 * All paths are relative to the configured root directory.
 */
export class FileSystemStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  async read(relativePath: string): Promise<string> {
    const abs = this.abs(relativePath);
    try {
      return await fs.readFile(abs, 'utf8');
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      throw new Error(`FileSystemStorage.read: cannot read "${abs}": ${e.message}`);
    }
  }

  async write(relativePath: string, content: string): Promise<void> {
    const abs = this.abs(relativePath);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content, 'utf8');
  }

  async exists(relativePath: string): Promise<boolean> {
    return fs.pathExists(this.abs(relativePath));
  }

  async list(prefix: string): Promise<string[]> {
    const absDir = this.abs(prefix);
    const exists = await fs.pathExists(absDir);
    if (!exists) return [];

    const files = await glob('**/*', {
      cwd: absDir,
      nodir: true,
    });

    return files.map((f) => `${prefix}/${f}`);
  }

  private abs(relativePath: string): string {
    return path.join(this.root, relativePath);
  }
}
