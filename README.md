# vibehub
Vibes-First, Self-Hosted, Git-Like Project Manager

**Current status:** **CLI** (`packages/cli`), **Web** (Next.js in `packages/web`), and **Desktop** (Tauri in `packages/desktop`) are in the repo. The web app shows placeholder **acme/** projects (e.g. `acme/payments-service`) — they’re hardcoded demo data, not from a DB; replace with real project data when you wire up the API.

**Desktop:** Open a folder that has a `.vibe/` directory (or run `vibe init` in a repo first), then use **Open Project** in the top bar so the app is “connected.” Chat requires `GEMINI_API_KEY` in the environment.

**Node:** Use Node 20+. Run `nvm use` if you use nvm (see `.nvmrc`).
