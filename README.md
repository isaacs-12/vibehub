# vibehub
Vibes-First, Self-Hosted, Git-Like Project Manager

**Current status:** Only the **CLI** (`packages/cli`) and shared types/storage/DB abstractions exist. The **Web Forge** (Next.js) and **Desktop App** (Tauri) are planned; not yet in this repo.

**Node:** Use Node 20 (LTS). The CLI depends on `better-sqlite3`, which does not yet support Node 25. Run `nvm use` if you use nvm (see `.nvmrc`).
