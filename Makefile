SHELL := /bin/bash
.DEFAULT_GOAL := help

# ── Config ────────────────────────────────────────────────────────────────────
VENV       := .venv
PYTHON     := $(VENV)/bin/python
PIP        := $(VENV)/bin/pip
NODE       := node
NPM        := npm
DC         := docker compose
DC_RUN     := $(DC) run --rm

# Colours
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[0;32m
CYAN  := \033[0;36m

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  $(BOLD)VibeHub — local dev$(RESET)"
	@echo ""
	@echo "  $(CYAN)Setup$(RESET)"
	@echo "    make setup          One-shot: copy .env, install all deps, start infra"
	@echo "    make install        Install Node deps for all packages"
	@echo "    make venv           Create Python venv + install requirements.txt"
	@echo ""
	@echo "  $(CYAN)Docker / Infrastructure (local stack)$(RESET)"
	@echo "    make up             Start postgres + localstack + web (docker)"
	@echo "    make down           Stop and remove all containers (frees ports)"
	@echo "    make local-up       Same as up — start local stack"
	@echo "    make local-down     Same as down — stop local stack, free ports"
	@echo "    make restart        down + up (use if ports were in use)"
	@echo "    make logs           Tail logs from all services"
	@echo "    make ps             Show running containers"
	@echo "    make nuke           Stop containers AND delete volumes (destructive!)"
	@echo ""
	@echo "  $(CYAN)Development$(RESET)"
	@echo "    make dev            Start infra (docker) + web dev server (native, hot-reload)"
	@echo "    make desktop        Start Tauri desktop dev (native only, no Docker)"
	@echo "    make build          Build CLI + web packages"
	@echo "    make build-cli      Build CLI only"
	@echo "    make build-web      Build web only"
	@echo ""
	@echo "  $(CYAN)Database$(RESET)"
	@echo "    make db-push        Apply Drizzle schema to local postgres"
	@echo "    make db-studio      Open Drizzle Studio in browser"
	@echo "    make db-psql        Open a psql shell"
	@echo ""
	@echo "  $(CYAN)CLI (vibe)$(RESET)"
	@echo "    make vibe-init      Run: vibe init in current dir"
	@echo "    make vibe-read      Run: vibe read in current dir"
	@echo "    make vibe-import    Run: vibe import --repo . (needs GEMINI_API_KEY)"
	@echo ""
	@echo "  $(CYAN)S3 / LocalStack$(RESET)"
	@echo "    make s3-ls          List vibehub-artifacts bucket contents"
	@echo "    make s3-create      (Re-)create the bucket in LocalStack"
	@echo ""
	@echo "  $(CYAN)Quality$(RESET)"
	@echo "    make lint           Run pre-commit on all files"
	@echo "    make clean          Remove build artefacts and caches"
	@echo ""

# ── One-shot Setup ────────────────────────────────────────────────────────────
.PHONY: setup
setup: .env install venv up db-push
	@echo ""
	@echo "  $(GREEN)✔ Setup complete!$(RESET)"
	@echo "  Web:       http://localhost:3000"
	@echo "  Postgres:  localhost:5433  (user: vibehub  pass: vibehub)"
	@echo "  LocalStack: http://localhost:4566"
	@echo ""

.env:
	@if [ ! -f .env ]; then \
	  cp .env.example .env; \
	  echo "  Copied .env.example → .env (edit it to add your GEMINI_API_KEY)"; \
	fi

# ── Node deps ─────────────────────────────────────────────────────────────────
.PHONY: install
install:
	$(NPM) install

# ── Python venv ───────────────────────────────────────────────────────────────
.PHONY: venv
venv: $(VENV)/bin/activate

$(VENV)/bin/activate: requirements.txt
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip --quiet
	$(PIP) install -r requirements.txt --quiet
	@echo "  $(GREEN)✔ Python venv ready$(RESET)  (activate: source $(VENV)/bin/activate)"

# ── Docker / Infra (local stack) ─────────────────────────────────────────────
.PHONY: up down local-up local-down restart logs ps nuke
up: local-up

down: local-down

local-up:
	$(DC) up -d --build
	@echo "  $(GREEN)✔ Local stack up$(RESET)  (postgres, localstack, web)"

local-down:
	$(DC) down --remove-orphans
	@echo "  $(GREEN)✔ Local stack down$(RESET)  (ports 5433, 4566, 3000 freed)"

restart: local-down local-up

logs:
	$(DC) logs -f

ps:
	$(DC) ps

nuke:
	@echo "  ⚠️  Deleting all containers AND volumes!"
	$(DC) down -v --remove-orphans

# ── Dev modes ─────────────────────────────────────────────────────────────────
# Start infra in Docker, but run Next.js natively for maximum hot-reload speed
.PHONY: dev desktop
dev: .env
	$(DC) up -d postgres localstack
	@echo "  Waiting for postgres…"
	@until $(DC) exec -T postgres pg_isready -U vibehub > /dev/null 2>&1; do sleep 1; done
	@echo "  $(GREEN)✔ Infra ready$(RESET)"
	$(NPM) run dev --workspace=packages/web

# Tauri must run natively — it compiles a native binary + opens a window
# Free port 1420 if a previous desktop dev run is still holding it
desktop: .env
	@lsof -ti:1420 | xargs kill -9 2>/dev/null || true
	@echo "  Starting Vibe Studio (native Tauri)…"
	$(NPM) run tauri dev --workspace=packages/desktop

# ── Build ─────────────────────────────────────────────────────────────────────
.PHONY: build build-cli build-web
build: build-cli build-web

build-cli:
	$(NPM) run build --workspace=packages/cli

build-web:
	$(NPM) run build --workspace=packages/web

# ── Database ──────────────────────────────────────────────────────────────────
.PHONY: db-push db-studio db-psql
db-push:
	@$(call require-env, DATABASE_URL)
	$(NPM) run db:push --workspace=packages/web

db-studio:
	@$(call require-env, DATABASE_URL)
	$(NPM) run db:studio --workspace=packages/web

db-psql:
	$(DC) exec postgres psql -U vibehub vibehub

# ── CLI (vibe) ────────────────────────────────────────────────────────────────
.PHONY: vibe-init vibe-read vibe-import
vibe-init: build-cli
	node packages/cli/dist/cli.js init

vibe-read: build-cli
	node packages/cli/dist/cli.js read

vibe-import: build-cli
	@$(call require-env, GEMINI_API_KEY)
	node packages/cli/dist/cli.js import --repo . --api-key $$GEMINI_API_KEY

# ── S3 / LocalStack ───────────────────────────────────────────────────────────
.PHONY: s3-ls s3-create
s3-ls:
	$(VENV)/bin/awslocal s3 ls s3://vibehub-artifacts --recursive

s3-create:
	$(VENV)/bin/awslocal s3 mb s3://vibehub-artifacts --region us-east-1 || true

# ── Quality ───────────────────────────────────────────────────────────────────
.PHONY: lint
lint: venv
	$(VENV)/bin/pre-commit run --all-files

# ── Clean ─────────────────────────────────────────────────────────────────────
.PHONY: clean
clean:
	rm -rf \
	  packages/cli/dist \
	  packages/web/.next \
	  packages/desktop/dist \
	  packages/desktop/src-tauri/target \
	  node_modules \
	  packages/*/node_modules \
	  $(VENV)
	@echo "  $(GREEN)✔ Cleaned$(RESET)"

# ── Helpers ───────────────────────────────────────────────────────────────────
define require-env
  @if [ -z "$$$(1)" ]; then \
    echo "  Error: $(1) is not set. Add it to .env or export it."; \
    exit 1; \
  fi
endef
