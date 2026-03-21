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

# ── GCP Config ────────────────────────────────────────────────────────────────
GCP_PROJECT  := vibehub-490503
GCP_REGION   := us-west1
GCP_ACCOUNT  := isaacmckeesmith@gmail.com
WEB_SERVICE  := vibehub
API_SERVICE  := api
GCR          := $(GCP_REGION)-docker.pkg.dev/$(GCP_PROJECT)/vibehub
SA_EMAIL     := vibehub-backend@$(GCP_PROJECT).iam.gserviceaccount.com
SQL_INSTANCE := $(GCP_PROJECT):$(GCP_REGION):vibehub-db

# Colours
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[0;32m
CYAN  := \033[0;36m
RED   := \033[0;31m

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
	@echo "    make vibe-clone     Run: vibe clone owner/repo (creates dir + .vibe/)"
	@echo "    make vibe-install   Add vibe to PATH in ~/.zshrc so you can run vibe from anywhere"
	@echo "    make vibe-read      Run: vibe read in current dir"
	@echo "    make vibe-import    Run: vibe import --repo . (needs GEMINI_API_KEY)"
	@echo "    make vibe-compile   Codegen + typecheck + tests + AI requirements review"
	@echo "    make vibe-check     Validate existing code only (no generation, safe for CI)"
	@echo ""
	@echo "  $(CYAN)GCP / Production$(RESET)"
	@echo "    make gcp             Login, set project, configure Docker auth"
	@echo "    make gcp-check      Verify gcloud auth + project"
	@echo "    make deploy-web     Build & deploy web to Cloud Run"
	@echo "    make deploy-agent   Build & deploy agent to Cloud Run"
	@echo "    make deploy-all     Deploy both web + agent"
	@echo "    make build-desktop  Build VibeStudio .app/.dmg"
	@echo "    make release VERSION=x.y.z  Bump versions, build all, deploy, create GitHub release"
	@echo "    make db-migrate-prod  Run Drizzle push against prod DATABASE_URL"
	@echo "    make secrets-list   List required GCP secrets"
	@echo "    make secrets-create Create all secret placeholders in Secret Manager"
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
# Free port 1420 if a previous desktop dev run is still holding it.
# Loads .env so GEMINI_API_KEY (and others) are available to the desktop app.
desktop: .env
	@lsof -ti:1420 | xargs kill -9 2>/dev/null || true
	@echo "  Starting Vibe Studio (native Tauri)…"
	@set -a && . ./.env && set +a && $(NPM) run tauri dev --workspace=packages/desktop

# ── Build ─────────────────────────────────────────────────────────────────────
.PHONY: build build-cli build-web
VIBE_BIN_DIR := $(abspath $(CURDIR)/packages/cli/dist)

build: build-cli build-web

build-cli:
	cd packages/cli && go build -o dist/vibe .
	@echo "  $(GREEN)✔ CLI built$(RESET)  (packages/cli/dist/vibe)"
	@if grep -q "vibehub vibe CLI" ~/.zshrc 2>/dev/null; then \
		:; \
	else \
		echo "" >> ~/.zshrc; \
		echo "# vibehub vibe CLI (added by make build-cli)" >> ~/.zshrc; \
		echo "export PATH=\"$(VIBE_BIN_DIR):\$$PATH\"" >> ~/.zshrc; \
		echo "  $(GREEN)✔ Added vibe to PATH$(RESET) in ~/.zshrc"; \
	fi
	@echo "  To use \`vibe\` in this terminal now:  export PATH=\"$(VIBE_BIN_DIR):$$PATH\""

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
.PHONY: vibe-init vibe-clone vibe-install vibe-read vibe-import vibe-compile vibe-check

vibe-init: build-cli
	packages/cli/dist/vibe init

vibe-clone: build-cli
	@test -n "$(owner)" && test -n "$(repo)" || { echo "  Usage: make vibe-clone owner=ims repo=test"; exit 1; }
	packages/cli/dist/vibe clone $(owner)/$(repo)

vibe-install: build-cli
	@echo "  PATH already updated by build-cli; run \`vibe\` in a new terminal (or eval the export from ~/.zshrc)."

vibe-read: build-cli
	packages/cli/dist/vibe read

vibe-import: build-cli
	@$(call require-env, GEMINI_API_KEY)
	packages/cli/dist/vibe import --repo . --api-key $$GEMINI_API_KEY

# Full compile: codegen + typecheck + tests + AI requirements review
vibe-compile: build-cli
	@$(call require-env, GEMINI_API_KEY)
	packages/cli/dist/vibe compile --dir . --api-key $$GEMINI_API_KEY

# Check-only: validate existing code without generating anything (safe for CI)
vibe-check: build-cli
	@$(call require-env, GEMINI_API_KEY)
	packages/cli/dist/vibe compile --dir . --check --api-key $$GEMINI_API_KEY

go-tidy:
	@command -v go >/dev/null 2>&1 || { echo "  Go not found (install from https://go.dev/dl or skip go-tidy)."; exit 0; }
	cd packages/cli && go mod tidy

# ── GCP / Production ─────────────────────────────────────────────────────────
.PHONY: gcp gcp-check deploy-web deploy-agent deploy-all db-migrate-prod secrets-list secrets-create

# Login to the right GCP account + set project + configure Docker auth
gcp:
	gcloud auth login $(GCP_ACCOUNT)
	gcloud config set project $(GCP_PROJECT)
	gcloud auth configure-docker $(GCP_REGION)-docker.pkg.dev --quiet
	@echo "  $(GREEN)✔ Logged in as $(GCP_ACCOUNT), project $(GCP_PROJECT), Docker auth configured$(RESET)"

# Safety check: verify gcloud is authed as the right account + project
gcp-check:
	@echo "  Checking gcloud credentials…"
	@ACTIVE_ACCOUNT=$$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null); \
	if [ "$$ACTIVE_ACCOUNT" != "$(GCP_ACCOUNT)" ]; then \
		echo "  $(RED)✘ Wrong gcloud account: $$ACTIVE_ACCOUNT$(RESET)"; \
		echo "  Expected: $(GCP_ACCOUNT)"; \
		echo "  Run: gcloud auth login $(GCP_ACCOUNT)"; \
		exit 1; \
	fi
	@ACTIVE_PROJECT=$$(gcloud config get-value project 2>/dev/null); \
	if [ "$$ACTIVE_PROJECT" != "$(GCP_PROJECT)" ]; then \
		echo "  $(RED)✘ Wrong gcloud project: $$ACTIVE_PROJECT$(RESET)"; \
		echo "  Expected: $(GCP_PROJECT)"; \
		echo "  Run: gcloud config set project $(GCP_PROJECT)"; \
		exit 1; \
	fi
	@echo "  $(GREEN)✔ gcloud: $(GCP_ACCOUNT) / $(GCP_PROJECT)$(RESET)"

# Build + deploy web (Next.js) to Cloud Run
deploy-web: gcp-check
	@echo "  Building web image…"
	docker build --platform linux/amd64 -f packages/web/Dockerfile.prod -t $(GCR)/web:latest .
	docker push $(GCR)/web:latest
	gcloud run deploy $(WEB_SERVICE) \
		--image $(GCR)/web:latest \
		--region $(GCP_REGION) \
		--platform managed \
		--allow-unauthenticated \
		--port 3000 \
		--service-account $(SA_EMAIL) \
		--add-cloudsql-instances $(SQL_INSTANCE) \
		--memory 512Mi \
		--cpu 1 \
		--min-instances 0 \
		--max-instances 2 \
		--set-secrets="DATABASE_URL=DATABASE_URL:latest,GCS_BUCKET=GCS_BUCKET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,AUTH_SECRET=AUTH_SECRET:latest" \
		--set-env-vars="NODE_ENV=production,AUTH_URL=https://getvibehub.com"
	@echo "  $(GREEN)✔ Web deployed to Cloud Run$(RESET)"

# Build + deploy agent worker to Cloud Run
deploy-agent: gcp-check
	@echo "  Building agent image…"
	docker build --platform linux/amd64 -t $(GCR)/agent:latest packages/agent
	docker push $(GCR)/agent:latest
	gcloud run deploy $(API_SERVICE) \
		--image $(GCR)/agent:latest \
		--region $(GCP_REGION) \
		--platform managed \
		--no-allow-unauthenticated \
		--service-account $(SA_EMAIL) \
		--add-cloudsql-instances $(SQL_INSTANCE) \
		--memory 512Mi \
		--cpu 1 \
		--min-instances 0 \
		--max-instances 2 \
		--set-secrets="DATABASE_URL=DATABASE_URL:latest,GCS_BUCKET=GCS_BUCKET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest" \
		--set-env-vars="NODE_ENV=production"
	@echo "  $(GREEN)✔ Agent deployed to Cloud Run$(RESET)"

deploy-all: deploy-web deploy-agent

# Run Drizzle schema push against production database (via local Cloud SQL proxy)
db-migrate-prod: gcp-check
	@command -v cloud-sql-proxy >/dev/null 2>&1 || { echo "  $(RED)✘ cloud-sql-proxy not found$(RESET)"; echo "  Install: brew install cloud-sql-proxy"; exit 1; }
	@lsof -ti:5499 | xargs kill -9 2>/dev/null; sleep 1; true
	@echo "  Starting Cloud SQL proxy on :5499…"
	@cloud-sql-proxy $(SQL_INSTANCE) --port 5499 & sleep 3
	@echo "  Running Drizzle push…"
	@DB_PASS=$$(gcloud secrets versions access latest --secret=DATABASE_PASSWORD --project=$(GCP_PROJECT) | python3 -c "import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read().strip(),safe=''))") && \
	DATABASE_URL="postgresql://postgres:$$DB_PASS@localhost:5499/vibehub" $(NPM) run db:push --workspace=packages/web; \
	EXIT_CODE=$$?; \
	lsof -ti:5499 | xargs kill -9 2>/dev/null || true; \
	exit $$EXIT_CODE

# List all secrets needed in GCP Secret Manager
secrets-list:
	@echo ""
	@echo "  $(BOLD)Required GCP secrets for $(GCP_PROJECT):$(RESET)"
	@echo ""
	@echo "    $(CYAN)DATABASE_URL$(RESET)          Postgres connection string (Cloud SQL or external)"
	@echo "    $(CYAN)GCS_BUCKET$(RESET)            GCS bucket name for artifact storage"
	@echo "    $(CYAN)GEMINI_API_KEY$(RESET)         Google AI / Gemini API key for codegen"
	@echo "    $(CYAN)GOOGLE_CLIENT_ID$(RESET)       Google OAuth client ID"
	@echo "    $(CYAN)GOOGLE_CLIENT_SECRET$(RESET)   Google OAuth client secret"
	@echo "    $(CYAN)AUTH_SECRET$(RESET)            NextAuth session encryption key (openssl rand -base64 32)"
	@echo ""
	@echo "  Create them with: make secrets-create"
	@echo "  Then set values:  gcloud secrets versions add SECRET_NAME --data-file=-"
	@echo ""

# Create secret placeholders in Secret Manager (idempotent)
secrets-create: gcp-check
	@for secret in DATABASE_URL GCS_BUCKET GEMINI_API_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET AUTH_SECRET; do \
		if gcloud secrets describe $$secret --project=$(GCP_PROJECT) >/dev/null 2>&1; then \
			echo "  ○ $$secret already exists"; \
		else \
			gcloud secrets create $$secret --project=$(GCP_PROJECT) --replication-policy=automatic; \
			echo "  $(GREEN)✔ Created $$secret$(RESET)"; \
		fi; \
	done
	@echo ""
	@echo "  Now add values:  echo 'your-value' | gcloud secrets versions add SECRET_NAME --data-file=-"

# ── Quality ───────────────────────────────────────────────────────────────────
.PHONY: lint
lint: venv
	$(VENV)/bin/pre-commit run --all-files

# ── Release ───────────────────────────────────────────────────────────────────
# Unified release: bumps versions everywhere, cross-compiles CLI, builds desktop,
# deploys web + agent to Cloud Run, creates a single GitHub release with all artifacts.
#
# Usage:  make release VERSION=0.2.0
#
# Steps:
#   1. Bump version in all package.json + tauri.conf.json
#   2. Cross-compile CLI for macOS + Linux (arm64/amd64)
#   3. Build VibeStudio desktop app (.dmg)
#   4. Deploy web + agent to Cloud Run
#   5. Commit version bump, tag, create GitHub release with all artifacts
#
.PHONY: release build-desktop build-cli-all version-bump

build-desktop:
	@echo "  Building VibeStudio…"
	$(NPM) run tauri build --workspace=packages/desktop
	@echo "  $(GREEN)✔ Desktop build complete$(RESET)"
	@echo "  Artifacts: packages/desktop/src-tauri/target/release/bundle/"

build-cli-all:
	@echo "  Cross-compiling CLI…"
	@mkdir -p packages/cli/dist
	@cd packages/cli && \
	for pair in darwin/arm64 darwin/amd64 linux/amd64 linux/arm64; do \
		os=$${pair%%/*}; arch=$${pair##*/}; \
		echo "    $$os/$$arch…"; \
		GOOS=$$os GOARCH=$$arch CGO_ENABLED=0 go build -ldflags="-s -w" -o dist/vibe . ; \
		tar -czf dist/vibe-$$os-$$arch.tar.gz -C dist vibe; \
		rm dist/vibe; \
	done
	@echo "  $(GREEN)✔ CLI cross-compiled$(RESET)  (4 tarballs in packages/cli/dist/)"

version-bump:
	@if [ -z "$(VERSION)" ]; then echo "  $(RED)✘ VERSION required$(RESET)  Usage: make release VERSION=0.2.0"; exit 1; fi
	@echo "  Bumping version to $(VERSION)…"
	@for f in package.json packages/web/package.json packages/agent/package.json packages/desktop/package.json; do \
		sed -i '' 's/"version": *"[^"]*"/"version": "$(VERSION)"/' $$f; \
	done
	@sed -i '' 's/"version": *"[^"]*"/"version": "$(VERSION)"/' packages/desktop/src-tauri/tauri.conf.json
	@echo "  $(GREEN)✔ All manifests bumped to $(VERSION)$(RESET)"

release: version-bump build-cli-all build-desktop deploy-all
	@if [ -z "$(VERSION)" ]; then echo "  $(RED)✘ VERSION required$(RESET)  Usage: make release VERSION=0.2.0"; exit 1; fi
	@command -v gh >/dev/null 2>&1 || { echo "  $(RED)✘ gh CLI not found$(RESET)  Install: brew install gh"; exit 1; }
	@echo ""
	@echo "  $(BOLD)Creating release v$(VERSION)…$(RESET)"
	@echo ""
	@# Commit version bump + tag
	git add package.json packages/web/package.json packages/agent/package.json packages/desktop/package.json packages/desktop/src-tauri/tauri.conf.json
	git commit -m "release v$(VERSION)"
	git tag "v$(VERSION)"
	@echo "  $(GREEN)✔ Tagged v$(VERSION)$(RESET)"
	@# Collect release assets
	@ASSETS=""; \
	for f in packages/cli/dist/vibe-*.tar.gz; do \
		ASSETS="$$ASSETS $$f"; \
		echo "  CLI: $$f"; \
	done; \
	DMG=$$(find packages/desktop/src-tauri/target/release/bundle/dmg -name '*.dmg' 2>/dev/null | head -1); \
	if [ -n "$$DMG" ]; then ASSETS="$$ASSETS $$DMG"; echo "  Desktop: $$DMG"; fi; \
	APP_PATH=$$(find packages/desktop/src-tauri/target/release/bundle/macos -name '*.app' 2>/dev/null | head -1); \
	if [ -n "$$APP_PATH" ]; then \
		TAR_NAME="VibeStudio-$(VERSION)-macos.tar.gz"; \
		tar -czf "$$TAR_NAME" -C "$$(dirname $$APP_PATH)" "$$(basename $$APP_PATH)"; \
		ASSETS="$$ASSETS $$TAR_NAME"; \
		echo "  Desktop: $$TAR_NAME"; \
	fi; \
	if [ -z "$$ASSETS" ]; then echo "  $(RED)✘ No artifacts found$(RESET)"; exit 1; fi; \
	gh release create "v$(VERSION)" $$ASSETS \
		--title "v$(VERSION)" \
		--generate-notes \
		--latest
	@echo ""
	@echo "  $(GREEN)✔ Released v$(VERSION)$(RESET)"
	@echo "  $(CYAN)https://github.com/isaacs-12/vibehub/releases/tag/v$(VERSION)$(RESET)"
	@echo ""
	@echo "  Don't forget to push:  git push origin main v$(VERSION)"

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
