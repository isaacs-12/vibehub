#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { VibeProject } from './VibeProject.js';
import { Viber } from './viber.js';

const program = new Command();

program
  .name('vibe')
  .description('VibeHub CLI — vibe-first Git forge')
  .version('0.1.0');

// ─── vibe init ────────────────────────────────────────────────────────────────
program
  .command('init [name]')
  .description('Initialize a new VibeHub project in the current directory')
  .option('-d, --dir <path>', 'Target directory', '.')
  .action(async (name: string | undefined, opts: { dir: string }) => {
    const project = new VibeProject(opts.dir);
    await project.init(name ?? 'my-vibe-project');
    console.log(chalk.green(`✔ Initialized vibe project in ${opts.dir}/.vibe/`));
  });

// ─── vibe import ──────────────────────────────────────────────────────────────
program
  .command('import')
  .description('Import an existing Git repo and extract its Vibes via Gemini')
  .requiredOption('-r, --repo <path>', 'Path to the existing Git repository')
  .requiredOption('-k, --api-key <key>', 'Gemini API key', process.env.GEMINI_API_KEY)
  .action(async (opts: { repo: string; apiKey: string }) => {
    if (!opts.apiKey) {
      console.error(chalk.red('Error: Gemini API key required (--api-key or GEMINI_API_KEY env var)'));
      process.exit(1);
    }
    console.log(chalk.cyan(`Scanning repository at ${opts.repo}…`));
    const viber = new Viber(opts.apiKey);
    const project = new VibeProject(opts.repo);
    await project.importFromRepo(viber);
    console.log(chalk.green(`✔ Vibes extracted and written to ${opts.repo}/.vibe/`));
  });

// ─── vibe read ────────────────────────────────────────────────────────────────
program
  .command('read')
  .description('Read the current project\'s vibe and print a summary')
  .option('-d, --dir <path>', 'Project directory', '.')
  .action(async (opts: { dir: string }) => {
    const project = new VibeProject(opts.dir);
    await project.read();
  });

program.parseAsync(process.argv);
