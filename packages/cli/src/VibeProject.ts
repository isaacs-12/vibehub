import path from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { FileSystemStorage } from './storage/FileSystemStorage.js';
import type { StorageProvider, VibeFeature, VibeMapping, VibeRequirement, VibeSnapshot } from './types.js';
import type { Viber } from './viber.js';

const VIBE_DIR = '.vibe';
const FEATURES_DIR = `${VIBE_DIR}/features`;
const REQUIREMENTS_DIR = `${VIBE_DIR}/requirements`;
const MAPPING_FILE = `${VIBE_DIR}/mapping.json`;
const META_FILE = `${VIBE_DIR}/meta.json`;

interface VibeMeta {
  name: string;
  createdAt: string;
  version: string;
}

/**
 * VibeProject encapsulates all operations on a project's .vibe/ directory.
 * It uses a StorageProvider so the same logic works on the local filesystem
 * or against a remote store (S3, GCS, etc.).
 */
export class VibeProject {
  private storage: StorageProvider;

  constructor(
    private readonly rootPath: string,
    storage?: StorageProvider,
  ) {
    this.storage = storage ?? new FileSystemStorage(rootPath);
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  /** Scaffold an empty .vibe/ directory for a brand-new project. */
  async init(name: string): Promise<void> {
    await this.ensureDirectories();

    const meta: VibeMeta = {
      name,
      createdAt: new Date().toISOString(),
      version: '0.1.0',
    };
    await this.storage.write(META_FILE, JSON.stringify(meta, null, 2));

    const emptyMapping: VibeMapping = {};
    await this.storage.write(MAPPING_FILE, JSON.stringify(emptyMapping, null, 2));

    // Seed a starter feature
    const starterFeature = [
      `# ${name}`,
      '',
      '## Overview',
      'Describe the core purpose of this project.',
      '',
      '## Goals',
      '- [ ] Define primary goal',
      '',
      '## Non-Goals',
      '- List things explicitly out of scope',
    ].join('\n');
    await this.storage.write(`${FEATURES_DIR}/overview.md`, starterFeature);

    // Seed a starter tech-stack requirement
    const starterReq = yaml.dump({
      techStack: {
        language: 'TypeScript',
        runtime: 'Node.js',
        containerization: 'Docker',
      },
      security: {
        authentication: 'TBD',
        authorization: 'TBD',
      },
      storage: {
        local: 'FileSystem',
        production: 'S3',
      },
      database: {
        local: 'SQLite',
        production: 'Postgres',
      },
    });
    await this.storage.write(`${REQUIREMENTS_DIR}/tech-stack.yaml`, starterReq);
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  /**
   * Scan an existing Git repository and use the Viber (Gemini) to extract
   * features and requirements, writing them into .vibe/.
   */
  async importFromRepo(viber: Viber): Promise<void> {
    await this.ensureDirectories();

    const snapshot = await viber.extract(this.rootPath);

    const meta: VibeMeta = {
      name: snapshot.name,
      createdAt: new Date().toISOString(),
      version: '0.1.0',
    };
    await this.storage.write(META_FILE, JSON.stringify(meta, null, 2));

    for (const feature of snapshot.features) {
      await this.storage.write(`${FEATURES_DIR}/${feature.name}.md`, feature.content);
    }

    for (const req of snapshot.requirements) {
      await this.storage.write(`${REQUIREMENTS_DIR}/${req.name}.yaml`, yaml.dump(req.data));
    }

    await this.storage.write(MAPPING_FILE, JSON.stringify(snapshot.mapping, null, 2));
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  /**
   * Load the project's .vibe/ directory and print a human-readable summary
   * to the console.
   */
  async read(): Promise<void> {
    const snapshot = await this.load();
    this.printSummary(snapshot);
  }

  /** Load the full VibeSnapshot from storage. */
  async load(): Promise<VibeSnapshot> {
    const metaRaw = await this.storage.read(META_FILE);
    const meta: VibeMeta = JSON.parse(metaRaw);

    const featurePaths = await this.storage.list(FEATURES_DIR);
    const features: VibeFeature[] = await Promise.all(
      featurePaths
        .filter((p) => p.endsWith('.md'))
        .map(async (p) => ({
          name: path.basename(p, '.md'),
          content: await this.storage.read(p),
        })),
    );

    const reqPaths = await this.storage.list(REQUIREMENTS_DIR);
    const requirements: VibeRequirement[] = await Promise.all(
      reqPaths
        .filter((p) => p.endsWith('.yaml') || p.endsWith('.yml'))
        .map(async (p) => ({
          name: path.basename(p, path.extname(p)),
          data: yaml.load(await this.storage.read(p)) as Record<string, unknown>,
        })),
    );

    const mappingRaw = await this.storage.read(MAPPING_FILE);
    const mapping: VibeMapping = JSON.parse(mappingRaw);

    return { name: meta.name, features, requirements, mapping };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async ensureDirectories(): Promise<void> {
    // FileSystemStorage.write handles mkdirp, but for S3 we just write
    // sentinel objects so the "prefix" appears to exist.
    await this.storage.write(`${FEATURES_DIR}/.gitkeep`, '');
    await this.storage.write(`${REQUIREMENTS_DIR}/.gitkeep`, '');
  }

  private printSummary(snapshot: VibeSnapshot): void {
    const hr = chalk.dim('─'.repeat(60));

    console.log('');
    console.log(chalk.bold.magenta(`  VibeHub — ${snapshot.name}`));
    console.log(hr);

    // ── Features ──
    console.log(chalk.bold.cyan('\n  Features'));
    if (snapshot.features.length === 0) {
      console.log(chalk.dim('    (none)'));
    } else {
      for (const f of snapshot.features) {
        const firstLine = f.content.split('\n').find((l) => l.startsWith('# ')) ?? f.name;
        const title = firstLine.replace(/^#+\s*/, '');
        // Count checkboxes as a quick completion proxy
        const total = (f.content.match(/- \[.\]/g) ?? []).length;
        const done = (f.content.match(/- \[x\]/gi) ?? []).length;
        const badge = total > 0 ? chalk.dim(` [${done}/${total}]`) : '';
        console.log(`    ${chalk.yellow('●')} ${chalk.white(title)}${badge}`);
      }
    }

    // ── Requirements ──
    console.log(chalk.bold.cyan('\n  Requirements'));
    if (snapshot.requirements.length === 0) {
      console.log(chalk.dim('    (none)'));
    } else {
      for (const r of snapshot.requirements) {
        console.log(`    ${chalk.blue('◆')} ${chalk.white(r.name)}`);
        const topKeys = Object.keys(r.data);
        for (const key of topKeys.slice(0, 4)) {
          const val = r.data[key];
          const preview =
            typeof val === 'object' && val !== null
              ? Object.keys(val).join(', ')
              : String(val);
          console.log(chalk.dim(`        ${key}: ${preview}`));
        }
        if (topKeys.length > 4) {
          console.log(chalk.dim(`        … +${topKeys.length - 4} more`));
        }
      }
    }

    // ── Mapping ──
    const mappingKeys = Object.keys(snapshot.mapping);
    console.log(chalk.bold.cyan('\n  Source Mapping'));
    if (mappingKeys.length === 0) {
      console.log(chalk.dim('    (no mappings defined)'));
    } else {
      for (const key of mappingKeys) {
        const targets = snapshot.mapping[key].join(', ');
        console.log(`    ${chalk.green('→')} ${chalk.white(key)} ${chalk.dim(`→ ${targets}`)}`);
      }
    }

    console.log('\n' + hr + '\n');
  }
}
