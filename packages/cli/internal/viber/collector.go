package viber

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// FileCategory controls sampling priority — lower value = higher priority.
type FileCategory int

const (
	CategoryModel  FileCategory = iota // schemas, entities, migrations, types
	CategoryRoute                      // routes, handlers, controllers, API
	CategoryConfig                     // package.json, go.mod, Dockerfile, etc.
	CategoryCore                       // services, utils, core logic
	CategoryTest                       // tests and specs
	CategoryOther                      // README, misc
)

var categoryLabels = map[FileCategory]string{
	CategoryModel:  "Models, Schemas & Data Definitions",
	CategoryRoute:  "Routes, Handlers & API Endpoints",
	CategoryConfig: "Configuration & Project Metadata",
	CategoryCore:   "Core Logic & Services",
	CategoryTest:   "Tests",
	CategoryOther:  "Other",
}

// CollectedFile is a source file read from the repository.
type CollectedFile struct {
	RelPath  string
	Category FileCategory
	Content  string
}

// Directories to skip entirely during traversal.
var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, "dist": true, "build": true,
	"target": true, "__pycache__": true, ".next": true, ".nuxt": true,
	"coverage": true, ".turbo": true, ".cache": true, "vendor": true,
	".venv": true, "venv": true, ".tox": true, "out": true,
	".output": true, ".svelte-kit": true, ".vercel": true,
	".terraform": true, ".vibe": true, ".idea": true, ".vscode": true,
	"__mocks__": true, ".nyc_output": true, ".parcel-cache": true,
	"eggs": true, ".eggs": true, "site-packages": true,
}

// Source code extensions we always want to read.
var sourceExts = map[string]bool{
	".go": true, ".ts": true, ".tsx": true, ".js": true, ".jsx": true,
	".py": true, ".rs": true, ".java": true, ".kt": true, ".rb": true,
	".cs": true, ".swift": true, ".php": true, ".vue": true, ".svelte": true,
	".sql": true, ".graphql": true, ".gql": true, ".proto": true,
	".ex": true, ".exs": true, ".hs": true, ".ml": true, ".scala": true,
	".clj": true, ".lua": true, ".r": true, ".sh": true, ".bash": true,
}

// Config/data extensions allowed in specific contexts.
var dataExts = map[string]bool{
	".json": true, ".yaml": true, ".yml": true, ".toml": true,
	".ini": true, ".cfg": true, ".xml": true, ".prisma": true,
}

// Maximum total bytes of file content to collect.
// Gemini 2.5 Flash has a 1M-token context (~750KB text).
// We budget 600KB for source, leaving room for prompts and responses.
const maxTotalBytes = 600_000

// Maximum size of a single file — skip anything larger (likely generated).
const maxFileBytes = 50_000

// CollectFiles walks the repository, categorizes source files by role,
// and returns them sorted by priority (models first, then routes, etc.)
// along with the complete file tree (relative paths).
func CollectFiles(root string) ([]CollectedFile, []string, error) {
	type candidate struct {
		relPath  string
		fullPath string
		category FileCategory
		size     int64
	}

	var candidates []candidate
	var tree []string

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			name := d.Name()
			if skipDirs[name] || (strings.HasPrefix(name, ".") && name != ".") {
				return filepath.SkipDir
			}
			return nil
		}

		rel, _ := filepath.Rel(root, path)
		tree = append(tree, rel)

		info, err := d.Info()
		if err != nil || info.Size() > maxFileBytes || info.Size() == 0 {
			return nil
		}

		if isGenerated(d.Name(), rel) {
			return nil
		}

		cat := categorize(d.Name(), rel)
		if cat < 0 {
			return nil // not a file we care about
		}

		candidates = append(candidates, candidate{rel, path, cat, info.Size()})
		return nil
	})
	if err != nil {
		return nil, nil, fmt.Errorf("walking repo: %w", err)
	}

	// Sort by category priority, then by size (smaller first — focused files).
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].category != candidates[j].category {
			return candidates[i].category < candidates[j].category
		}
		return candidates[i].size < candidates[j].size
	})

	var files []CollectedFile
	total := 0
	for _, c := range candidates {
		if total >= maxTotalBytes {
			break
		}
		content, err := os.ReadFile(c.fullPath)
		if err != nil {
			continue
		}
		// Skip binary-looking content.
		if isBinary(content) {
			continue
		}
		total += len(content)
		files = append(files, CollectedFile{
			RelPath:  c.relPath,
			Category: c.category,
			Content:  string(content),
		})
	}

	return files, tree, nil
}

// FormatFilesForPrompt groups collected files by category into a readable
// prompt section with fenced code blocks.
func FormatFilesForPrompt(files []CollectedFile) string {
	grouped := map[FileCategory][]CollectedFile{}
	for _, f := range files {
		grouped[f.Category] = append(grouped[f.Category], f)
	}

	order := []FileCategory{CategoryModel, CategoryRoute, CategoryConfig, CategoryCore, CategoryTest, CategoryOther}
	var sb strings.Builder
	for _, cat := range order {
		group := grouped[cat]
		if len(group) == 0 {
			continue
		}
		sb.WriteString(fmt.Sprintf("\n### %s (%d files)\n\n", categoryLabels[cat], len(group)))
		for _, f := range group {
			sb.WriteString(fmt.Sprintf("#### %s\n```\n%s\n```\n\n", f.RelPath, f.Content))
		}
	}
	return sb.String()
}

// ---------- categorization helpers ----------

// categorize returns the FileCategory for a file, or -1 to skip it.
func categorize(name, rel string) FileCategory {
	lower := strings.ToLower(rel)
	nameLower := strings.ToLower(name)
	ext := strings.ToLower(filepath.Ext(name))

	// Always include config files we recognize.
	if isKnownConfig(nameLower) {
		return CategoryConfig
	}

	// Prisma schemas are models.
	if ext == ".prisma" {
		return CategoryModel
	}

	// SQL files are models.
	if ext == ".sql" {
		return CategoryModel
	}

	// GraphQL / protobuf are models (schema definitions).
	if ext == ".graphql" || ext == ".gql" || ext == ".proto" {
		return CategoryModel
	}

	// Source code — categorize by path/name patterns.
	if sourceExts[ext] {
		return categorizeSource(nameLower, lower)
	}

	// Data/config extensions in specific contexts.
	if dataExts[ext] {
		// Root-level or config-directory JSON/YAML = config.
		depth := strings.Count(rel, string(filepath.Separator))
		if depth <= 1 {
			return CategoryConfig
		}
		if containsAny(lower, "config", "setting") {
			return CategoryConfig
		}
		// Skip deep nested data files — usually fixtures or generated.
		return -1
	}

	// README.md only.
	if nameLower == "readme.md" {
		return CategoryOther
	}

	// Dockerfile, Makefile (no extension).
	if nameLower == "dockerfile" || nameLower == "makefile" || nameLower == "docker-compose.yml" || nameLower == "docker-compose.yaml" {
		return CategoryConfig
	}

	return -1 // skip unknown extensions
}

func categorizeSource(nameLower, relLower string) FileCategory {
	// Tests.
	if strings.Contains(relLower, "test") || strings.Contains(relLower, "spec") ||
		strings.HasSuffix(nameLower, "_test.go") || strings.Contains(relLower, "__tests__") {
		return CategoryTest
	}

	// Models / schemas / types / migrations / entities.
	if containsAny(relLower,
		"model", "schema", "entity", "entities", "types", "migration",
		"prisma", "drizzle", "typeorm", "sequelize", "knex",
		"struct", "dto", "domain",
	) {
		return CategoryModel
	}

	// Routes / handlers / controllers / API / resolvers.
	if containsAny(relLower,
		"route", "router", "handler", "controller", "api/",
		"endpoint", "resolver", "middleware", "guard",
		"pages/api/", "app/api/", // Next.js API routes
	) {
		return CategoryRoute
	}

	return CategoryCore
}

func isKnownConfig(nameLower string) bool {
	exact := []string{
		"package.json", "tsconfig.json", "go.mod", "cargo.toml",
		"pyproject.toml", "requirements.txt", "gemfile", "pom.xml",
		"build.gradle", "build.gradle.kts", "settings.gradle",
		"composer.json", "mix.exs", "project.clj", "build.sbt",
		".env.example", ".env.local.example",
	}
	for _, c := range exact {
		if nameLower == c {
			return true
		}
	}

	patterns := []string{
		"dockerfile", "docker-compose", "makefile",
		"next.config", "vite.config", "webpack.config", "rollup.config",
		"tailwind.config", "postcss.config", "jest.config", "vitest.config",
		"babel.config", ".babelrc", "tsconfig", "jsconfig",
		"eslint", "prettier", ".editorconfig",
		"nginx.conf", "fly.toml", "render.yaml", "vercel.json",
		"drizzle.config", "prisma/schema",
	}
	for _, p := range patterns {
		if strings.Contains(nameLower, p) {
			return true
		}
	}
	return false
}

func isGenerated(name, rel string) bool {
	lower := strings.ToLower(name)
	relLower := strings.ToLower(rel)

	// Lock files.
	if strings.HasSuffix(lower, "-lock.json") || strings.HasSuffix(lower, ".lock") ||
		lower == "package-lock.json" || lower == "yarn.lock" || lower == "pnpm-lock.yaml" ||
		lower == "go.sum" || lower == "cargo.lock" || lower == "poetry.lock" ||
		lower == "gemfile.lock" || lower == "composer.lock" {
		return true
	}

	// Minified files.
	if strings.Contains(lower, ".min.") {
		return true
	}

	// Source maps.
	if strings.HasSuffix(lower, ".map") || strings.HasSuffix(lower, ".d.ts") {
		return true
	}

	// Generated directories/files.
	if containsAny(relLower, "generated", "/gen/", "/__generated__/", "/auto_generated/") {
		return true
	}

	// Common generated files.
	if lower == "schema.generated.ts" || lower == "types.generated.ts" {
		return true
	}

	return false
}

func isBinary(content []byte) bool {
	// Check first 512 bytes for null bytes (common binary indicator).
	check := content
	if len(check) > 512 {
		check = check[:512]
	}
	for _, b := range check {
		if b == 0 {
			return true
		}
	}
	return false
}

func containsAny(s string, patterns ...string) bool {
	for _, p := range patterns {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}
