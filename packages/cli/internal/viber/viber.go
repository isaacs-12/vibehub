package viber

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
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

func (v *Viber) Extract(ctx context.Context, repoPath string) (*project.Snapshot, error) {
	tree, _ := fileTree(repoPath)
	commits := recentCommits(repoPath)
	sample := sampleContent(repoPath)
	prompt := buildPrompt(filepath.Base(repoPath), tree, commits, sample)

	client, err := genai.NewClient(ctx, option.WithAPIKey(v.apiKey))
	if err != nil {
		return nil, fmt.Errorf("gemini client: %w", err)
	}
	defer client.Close()

	resp, err := client.GenerativeModel(geminiModel).GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return nil, fmt.Errorf("gemini generate: %w", err)
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
	return parseResponse(filepath.Base(repoPath), sb.String())
}

func fileTree(root string) ([]string, error) {
	skip := map[string]bool{"node_modules": true, ".git": true, "dist": true, "build": true, "target": true, "__pycache__": true}
	var files []string
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || (d.IsDir() && skip[d.Name()]) {
			if d != nil && d.IsDir() && skip[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.IsDir() {
			rel, _ := filepath.Rel(root, path)
			files = append(files, rel)
		}
		return nil
	})
	return files, nil
}

func recentCommits(repoPath string) []string {
	out, err := exec.Command("git", "-C", repoPath, "log", "--oneline", "-10").Output()
	if err != nil {
		return []string{"(no git history found)"}
	}
	return strings.Split(strings.TrimSpace(string(out)), "\n")
}

func sampleContent(repoPath string) string {
	candidates := []string{"README.md", "go.mod", "package.json", "Cargo.toml", "pyproject.toml", "main.go", "src/main.go", "src/index.ts"}
	var parts []string
	total := 0
	for _, name := range candidates {
		if total >= 20_000 {
			break
		}
		raw, err := os.ReadFile(filepath.Join(repoPath, name))
		if err != nil {
			continue
		}
		s := string(raw)
		if len(s) > 4_000 {
			s = s[:4_000]
		}
		parts = append(parts, fmt.Sprintf("### %s\n```\n%s\n```", name, s))
		total += len(s)
	}
	if len(parts) == 0 {
		return "(no sample content available)"
	}
	return strings.Join(parts, "\n\n")
}

func buildPrompt(name string, tree, commits []string, sample string) string {
	treeStr := strings.Join(tree, "\n")
	if len(tree) > 500 {
		treeStr = strings.Join(tree[:500], "\n") + fmt.Sprintf("\n… +%d more", len(tree)-500)
	}
	return fmt.Sprintf(`You are a software architect analyzing a Git repository named %q.
Infer the project's human-readable Vibes — features and technical requirements.

## File Tree
`+"```"+"\n%s\n```"+`

## Last 10 Commits
`+"```"+"\n%s\n```"+`

## Sample Files
%s

---
Respond with ONLY valid JSON (no markdown fences):
{"features":[{"name":"<kebab>","content":"<markdown>"}],"requirements":[{"name":"<kebab>","data":{}}],"mapping":{"features/<name>.md":["<path>"]}}`,
		name, treeStr, strings.Join(commits, "\n"), sample)
}

type rawResp struct {
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

var fenceRe = regexp.MustCompile("(?s)^```(?:json)?\\n?(.*?)\\n?```$")
var kebabRe = regexp.MustCompile(`[^a-z0-9]+`)

func parseResponse(repoName, text string) (*project.Snapshot, error) {
	text = strings.TrimSpace(text)
	if m := fenceRe.FindStringSubmatch(text); m != nil {
		text = strings.TrimSpace(m[1])
	}
	var raw rawResp
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		preview := text
		if len(preview) > 400 {
			preview = preview[:400]
		}
		return nil, fmt.Errorf("invalid JSON from Gemini: %w\npreview: %s", err, preview)
	}

	snap := &project.Snapshot{Name: repoName, Mapping: project.Mapping{}}
	for _, f := range raw.Features {
		snap.Features = append(snap.Features, project.Feature{Name: kebab(f.Name), Content: f.Content})
	}
	for _, r := range raw.Requirements {
		snap.Requirements = append(snap.Requirements, project.Requirement{Name: kebab(r.Name), Data: r.Data})
	}
	for k, v := range raw.Mapping {
		snap.Mapping[k] = v
	}
	return snap, nil
}

func kebab(s string) string {
	return strings.Trim(kebabRe.ReplaceAllString(strings.ToLower(s), "-"), "-")
}
