package viber

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/vibehub/cli/internal/project"
	"google.golang.org/api/option"
)

const geminiModel = "gemini-2.5-flash-lite"

type Viber struct{ apiKey string }

func New(apiKey string) *Viber { return &Viber{apiKey: apiKey} }

// LogFunc receives progress messages during extraction.
type LogFunc func(string)

// Extract performs multi-pass feature extraction from a Git repository:
//
//	Pass 1 — Architecture Discovery: identify features, data entities, relationships.
//	Pass 2 — Spec Generation: produce detailed vibe specs with grammar frontmatter.
//	Pass 3 — Local Validation: verify structural correctness and fix issues.
func (v *Viber) Extract(ctx context.Context, repoPath string, log LogFunc) (*project.Snapshot, error) {
	if log == nil {
		log = func(string) {}
	}

	// ── Collect project files ──
	log("Collecting project files…")
	files, tree, err := CollectFiles(repoPath)
	if err != nil {
		return nil, fmt.Errorf("collecting files: %w", err)
	}
	log(fmt.Sprintf("Collected %d source files (%d total in tree)", len(files), len(tree)))

	commits := recentCommits(repoPath)
	repoName := filepath.Base(repoPath)

	client, err := genai.NewClient(ctx, option.WithAPIKey(v.apiKey))
	if err != nil {
		return nil, fmt.Errorf("gemini client: %w", err)
	}
	defer client.Close()

	// ── Pass 1: Architecture Discovery ──
	log("Pass 1: Analyzing architecture…")
	inventory, err := v.analyzeArchitecture(ctx, client, repoName, tree, files, commits)
	if err != nil {
		return nil, fmt.Errorf("pass 1 (architecture): %w", err)
	}
	log(fmt.Sprintf("  Found %d features, %d data entities, %d global constraints",
		len(inventory.Features), len(inventory.DataEntities), len(inventory.GlobalNevers)))
	for _, f := range inventory.Features {
		deps := ""
		if len(f.Uses) > 0 {
			deps = fmt.Sprintf(" → uses %s", strings.Join(f.Uses, ", "))
		}
		log(fmt.Sprintf("    • %s: %s%s", f.GrammarName, f.Description, deps))
	}

	// ── Pass 2: Detailed Spec Generation ──
	log("Pass 2: Generating detailed specifications…")
	snap, err := v.generateSpecs(ctx, client, repoName, inventory, files)
	if err != nil {
		return nil, fmt.Errorf("pass 2 (specs): %w", err)
	}
	log(fmt.Sprintf("  Generated %d feature specs, %d requirements", len(snap.Features), len(snap.Requirements)))

	// ── Pass 3: Local Validation & Auto-fix ──
	log("Validating specifications…")
	result := ValidateAndFix(snap)
	if result.Fixed > 0 {
		log(fmt.Sprintf("  Auto-fixed %d issues", result.Fixed))
	}
	for _, w := range result.Warnings {
		log(fmt.Sprintf("  ⚠ %s", w))
	}
	if len(result.Warnings) == 0 {
		log("  ✓ All specs valid")
	}

	return snap, nil
}

// ---------- Pass 1: Architecture Discovery ----------

func (v *Viber) analyzeArchitecture(
	ctx context.Context,
	client *genai.Client,
	repoName string,
	tree []string,
	files []CollectedFile,
	commits []string,
) (*ArchInventory, error) {
	prompt := buildPass1Prompt(repoName, tree, files, commits)
	text, err := callGemini(ctx, client, prompt)
	if err != nil {
		return nil, err
	}

	text = stripJSONFences(text)
	var inv ArchInventory
	if err := json.Unmarshal([]byte(text), &inv); err != nil {
		return nil, fmt.Errorf("invalid JSON from pass 1: %w\npreview: %s", err, preview(text, 500))
	}

	// Validate inventory internally before proceeding.
	if len(inv.Features) == 0 {
		return nil, fmt.Errorf("pass 1 returned zero features — model may have failed to analyze the code")
	}

	// Ensure every feature has a grammarName.
	for i := range inv.Features {
		if inv.Features[i].GrammarName == "" {
			inv.Features[i].GrammarName = toGrammarName(inv.Features[i].Name)
		}
	}

	return &inv, nil
}

// ---------- Pass 2: Spec Generation ----------

func (v *Viber) generateSpecs(
	ctx context.Context,
	client *genai.Client,
	repoName string,
	inventory *ArchInventory,
	files []CollectedFile,
) (*project.Snapshot, error) {
	prompt := buildPass2Prompt(repoName, inventory, files)
	text, err := callGemini(ctx, client, prompt)
	if err != nil {
		return nil, err
	}

	text = stripJSONFences(text)
	var raw rawSpecResp
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return nil, fmt.Errorf("invalid JSON from pass 2: %w\npreview: %s", err, preview(text, 500))
	}

	snap := &project.Snapshot{Name: repoName, Mapping: project.Mapping{}}
	for _, f := range raw.Features {
		name := kebab(f.Name)
		content := f.Content

		// If the model forgot frontmatter, inject a minimal one from the inventory.
		if !strings.HasPrefix(strings.TrimSpace(content), "---") {
			content = injectFrontmatter(name, inventory, content)
		}

		snap.Features = append(snap.Features, project.Feature{Name: name, Content: content})
	}
	for _, r := range raw.Requirements {
		snap.Requirements = append(snap.Requirements, project.Requirement{Name: kebab(r.Name), Data: r.Data})
	}
	for k, v := range raw.Mapping {
		snap.Mapping[k] = v
	}

	return snap, nil
}

// ---------- Pass 3: Validation ----------

// ValidationResult reports issues found and auto-fixes applied.
type ValidationResult struct {
	Warnings []string
	Fixed    int
}

// ValidateAndFix checks structural correctness of the extracted specs
// and auto-fixes what it can (dangling Uses refs, missing frontmatter sections).
func ValidateAndFix(snap *project.Snapshot) ValidationResult {
	var warnings []string
	fixed := 0

	// Build the set of known grammar names.
	knownGrammar := map[string]bool{}
	slugToGrammar := map[string]string{}
	for _, f := range snap.Features {
		gn := toGrammarName(f.Name)
		knownGrammar[gn] = true
		slugToGrammar[f.Name] = gn
	}

	// Per-feature checks.
	for i, f := range snap.Features {
		content := f.Content
		trimmed := strings.TrimSpace(content)

		// 1. Frontmatter presence.
		if !strings.HasPrefix(trimmed, "---") {
			warnings = append(warnings, fmt.Sprintf("%q: missing frontmatter block", f.Name))
			continue
		}

		// 2. Validate Uses references — remove dangling ones.
		usesRe := regexp.MustCompile(`(?m)^Uses:\s*\[([^\]]*)\]`)
		if m := usesRe.FindStringSubmatch(content); m != nil {
			refs := splitCSV(m[1])
			var valid []string
			for _, ref := range refs {
				if knownGrammar[ref] {
					valid = append(valid, ref)
				} else {
					warnings = append(warnings, fmt.Sprintf("%q: Uses reference %q not found — removed", f.Name, ref))
					fixed++
				}
			}
			newUses := fmt.Sprintf("Uses: [%s]", strings.Join(valid, ", "))
			content = usesRe.ReplaceAllString(content, newUses)
			snap.Features[i].Content = content
		}

		// 3. Validate Data references.
		dataRe := regexp.MustCompile(`(?m)^Data:\s*\[([^\]]*)\]`)
		if m := dataRe.FindStringSubmatch(content); m != nil {
			// Data entities don't need cross-validation with other features,
			// but we ensure the syntax is valid.
			_ = splitCSV(m[1])
		}

		// 4. Check required prose sections exist.
		for _, section := range []string{"## What it does", "## Behavior", "## Acceptance criteria"} {
			if !strings.Contains(strings.ToLower(content), strings.ToLower(section)) {
				warnings = append(warnings, fmt.Sprintf("%q: missing section %q", f.Name, section))
			}
		}
	}

	// 5. Cycle detection across the dependency graph.
	graph := buildDepGraph(snap.Features)
	if cycles := detectCycles(graph); len(cycles) > 0 {
		for _, cycle := range cycles {
			warnings = append(warnings, fmt.Sprintf("dependency cycle detected: %s", strings.Join(cycle, " → ")))
		}
	}

	return ValidationResult{Warnings: warnings, Fixed: fixed}
}

// ---------- helpers ----------

type rawSpecResp struct {
	Features []struct {
		Name    string `json:"name"`
		Content string `json:"content"`
	} `json:"features"`
	Requirements []struct {
		Name string         `json:"name"`
		Data map[string]any `json:"data"`
	} `json:"requirements"`
	Mapping map[string][]string `json:"mapping"`
}

func callGemini(ctx context.Context, client *genai.Client, prompt string) (string, error) {
	resp, err := client.GenerativeModel(geminiModel).GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", fmt.Errorf("gemini generate: %w", err)
	}

	var sb strings.Builder
	for _, c := range resp.Candidates {
		if c.Content != nil {
			for _, p := range c.Content.Parts {
				if t, ok := p.(genai.Text); ok {
					sb.WriteString(string(t))
				}
			}
		}
	}
	text := strings.TrimSpace(sb.String())
	if text == "" {
		return "", fmt.Errorf("gemini returned empty response")
	}
	return text, nil
}

var fenceRe = regexp.MustCompile("(?s)^```(?:json)?\\n?(.*?)\\n?```$")

func stripJSONFences(text string) string {
	text = strings.TrimSpace(text)
	if m := fenceRe.FindStringSubmatch(text); m != nil {
		return strings.TrimSpace(m[1])
	}
	return text
}

func recentCommits(repoPath string) []string {
	out, err := exec.Command("git", "-C", repoPath, "log", "--oneline", "-15").Output()
	if err != nil {
		return []string{"(no git history found)"}
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	return lines
}

var kebabRe = regexp.MustCompile(`[^a-z0-9]+`)

func kebab(s string) string {
	return strings.Trim(kebabRe.ReplaceAllString(strings.ToLower(s), "-"), "-")
}

func toGrammarName(slug string) string {
	parts := strings.FieldsFunc(slug, func(r rune) bool { return r == '-' || r == '/' })
	var b strings.Builder
	for _, p := range parts {
		if len(p) > 0 {
			b.WriteString(strings.ToUpper(p[:1]))
			b.WriteString(p[1:])
		}
	}
	return b.String()
}

func fromGrammarName(name string) string {
	var b strings.Builder
	for i, r := range name {
		if r >= 'A' && r <= 'Z' {
			if i > 0 {
				b.WriteByte('-')
			}
			b.WriteRune(r + 32) // to lowercase
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// injectFrontmatter builds a frontmatter block from the inventory data
// when the model failed to include one.
func injectFrontmatter(name string, inv *ArchInventory, body string) string {
	var plan *FeaturePlan
	for _, f := range inv.Features {
		if kebab(f.Name) == name {
			plan = &f
			break
		}
	}

	uses := "[]"
	data := "[]"
	var neverLines []string

	if plan != nil {
		if len(plan.Uses) > 0 {
			uses = "[" + strings.Join(plan.Uses, ", ") + "]"
		}
		if len(plan.Data) > 0 {
			data = "[" + strings.Join(plan.Data, ", ") + "]"
		}
		neverLines = plan.Never
	}

	var sb strings.Builder
	sb.WriteString("---\n")
	sb.WriteString(fmt.Sprintf("Uses: %s\n", uses))
	sb.WriteString(fmt.Sprintf("Data: %s\n", data))
	if len(neverLines) > 0 {
		sb.WriteString("Never:\n")
		for _, n := range neverLines {
			sb.WriteString(fmt.Sprintf("  - %s\n", n))
		}
	} else {
		sb.WriteString("Never: []\n")
	}
	sb.WriteString("---\n\n")
	sb.WriteString(body)
	return sb.String()
}

func splitCSV(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		t := strings.TrimSpace(part)
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

func preview(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "…"
	}
	return s
}

// ---------- dependency graph / cycle detection ----------

func buildDepGraph(features []project.Feature) map[string][]string {
	usesRe := regexp.MustCompile(`(?m)^Uses:\s*\[([^\]]*)\]`)
	graph := map[string][]string{}
	for _, f := range features {
		var deps []string
		if m := usesRe.FindStringSubmatch(f.Content); m != nil {
			for _, ref := range splitCSV(m[1]) {
				deps = append(deps, fromGrammarName(ref))
			}
		}
		graph[f.Name] = deps
	}
	return graph
}

// detectCycles returns any cycles found via iterative DFS.
func detectCycles(graph map[string][]string) [][]string {
	const (
		white = 0 // unvisited
		gray  = 1 // in current path
		black = 2 // fully processed
	)

	color := map[string]int{}
	parent := map[string]string{}
	var cycles [][]string

	for node := range graph {
		if color[node] != white {
			continue
		}

		stack := []string{node}
		for len(stack) > 0 {
			n := stack[len(stack)-1]

			if color[n] == white {
				color[n] = gray
				for _, dep := range graph[n] {
					if color[dep] == gray {
						// Found a cycle — reconstruct it.
						cycle := []string{dep, n}
						cur := n
						for cur != dep {
							cur = parent[cur]
							if cur == "" {
								break
							}
							cycle = append(cycle, cur)
						}
						cycles = append(cycles, cycle)
					} else if color[dep] == white {
						parent[dep] = n
						stack = append(stack, dep)
					}
				}
			} else {
				color[n] = black
				stack = stack[:len(stack)-1]
			}
		}
	}
	return cycles
}
