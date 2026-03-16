package project

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fatih/color"
	"gopkg.in/yaml.v3"
)

const vibeDir = ".vibe"

type Feature struct {
	Name    string
	Content string
}

type Requirement struct {
	Name string
	Data map[string]any
}

type Mapping map[string][]string

type Snapshot struct {
	Name         string
	Features     []Feature
	Requirements []Requirement
	Mapping      Mapping
}

type projectMeta struct {
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
	Version   string `json:"version"`
}

type Project struct {
	root string
}

func New(root string) *Project {
	return &Project{root: root}
}

func (p *Project) Init(name string) error {
	for _, sub := range []string{"features", "requirements"} {
		if err := os.MkdirAll(filepath.Join(p.root, vibeDir, sub), 0o755); err != nil {
			return err
		}
	}

	m := projectMeta{Name: name, CreatedAt: time.Now().Format(time.RFC3339), Version: "0.1.0"}
	if err := writeJSON(filepath.Join(p.root, vibeDir, "meta.json"), m); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(p.root, vibeDir, "mapping.json"), Mapping{}); err != nil {
		return err
	}

	starterFeature := fmt.Sprintf(FeatureTemplate, name)
	if err := os.WriteFile(filepath.Join(p.root, vibeDir, "features", "overview.md"), []byte(starterFeature), 0o644); err != nil {
		return err
	}

	starterReq := map[string]any{
		"techStack": map[string]any{"language": "Go", "containerization": "Docker"},
		"storage":   map[string]any{"local": "FileSystem", "production": "S3"},
		"database":  map[string]any{"local": "SQLite", "production": "Postgres"},
		"security":  map[string]any{"authentication": "TBD"},
	}
	raw, err := yaml.Marshal(starterReq)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(p.root, vibeDir, "requirements", "tech-stack.yaml"), raw, 0o644)
}

func (p *Project) ImportSnapshot(snap *Snapshot) error {
	for _, sub := range []string{"features", "requirements"} {
		if err := os.MkdirAll(filepath.Join(p.root, vibeDir, sub), 0o755); err != nil {
			return err
		}
	}

	m := projectMeta{Name: snap.Name, CreatedAt: time.Now().Format(time.RFC3339), Version: "0.1.0"}
	if err := writeJSON(filepath.Join(p.root, vibeDir, "meta.json"), m); err != nil {
		return err
	}

	for _, f := range snap.Features {
		path := filepath.Join(p.root, vibeDir, "features", f.Name+".md")
		if err := os.WriteFile(path, []byte(f.Content), 0o644); err != nil {
			return err
		}
	}

	for _, r := range snap.Requirements {
		raw, err := yaml.Marshal(r.Data)
		if err != nil {
			return err
		}
		path := filepath.Join(p.root, vibeDir, "requirements", r.Name+".yaml")
		if err := os.WriteFile(path, raw, 0o644); err != nil {
			return err
		}
	}

	return writeJSON(filepath.Join(p.root, vibeDir, "mapping.json"), snap.Mapping)
}

func (p *Project) Read() error {
	snap, err := p.Load()
	if err != nil {
		return err
	}
	printSummary(snap)
	return nil
}

func (p *Project) Load() (*Snapshot, error) {
	raw, err := os.ReadFile(filepath.Join(p.root, vibeDir, "meta.json"))
	if err != nil {
		return nil, fmt.Errorf("no .vibe/meta.json found — run `vibe init` first")
	}
	var m projectMeta
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}

	features, err := loadFeatures(filepath.Join(p.root, vibeDir, "features"))
	if err != nil {
		return nil, err
	}
	requirements, err := loadRequirements(filepath.Join(p.root, vibeDir, "requirements"))
	if err != nil {
		return nil, err
	}
	mappingRaw, err := os.ReadFile(filepath.Join(p.root, vibeDir, "mapping.json"))
	if err != nil {
		return nil, err
	}
	var mapping Mapping
	if err := json.Unmarshal(mappingRaw, &mapping); err != nil {
		return nil, err
	}

	return &Snapshot{Name: m.Name, Features: features, Requirements: requirements, Mapping: mapping}, nil
}

func printSummary(snap *Snapshot) {
	hr := color.HiBlackString(strings.Repeat("─", 60))
	fmt.Println()
	color.New(color.Bold, color.FgMagenta).Printf("  VibeHub — %s\n", snap.Name)
	fmt.Println(hr)

	color.New(color.Bold, color.FgCyan).Println("\n  Features")
	if len(snap.Features) == 0 {
		color.HiBlack("    (none)")
	} else {
		for _, f := range snap.Features {
			title := f.Name
			for _, line := range strings.Split(f.Content, "\n") {
				if strings.HasPrefix(line, "# ") {
					title = strings.TrimPrefix(line, "# ")
					break
				}
			}
			total := strings.Count(f.Content, "- [")
			done := strings.Count(f.Content, "- [x]") + strings.Count(f.Content, "- [X]")
			badge := ""
			if total > 0 {
				badge = color.HiBlackString(" [%d/%d]", done, total)
			}
			fmt.Printf("    %s %s%s\n", color.YellowString("●"), color.WhiteString(title), badge)
		}
	}

	color.New(color.Bold, color.FgCyan).Println("\n  Requirements")
	if len(snap.Requirements) == 0 {
		color.HiBlack("    (none)")
	}
	for _, r := range snap.Requirements {
		fmt.Printf("    %s %s\n", color.BlueString("◆"), color.WhiteString(r.Name))
		i := 0
		for k, v := range r.Data {
			if i >= 4 {
				color.HiBlack("        … +%d more", len(r.Data)-4)
				break
			}
			color.HiBlack("        %s: %v", k, v)
			i++
		}
	}

	color.New(color.Bold, color.FgCyan).Println("\n  Source Mapping")
	if len(snap.Mapping) == 0 {
		color.HiBlack("    (no mappings defined)")
	}
	for k, targets := range snap.Mapping {
		fmt.Printf("    %s %s %s\n",
			color.GreenString("→"),
			color.WhiteString(k),
			color.HiBlackString("→ "+strings.Join(targets, ", ")),
		)
	}

	fmt.Println("\n" + hr + "\n")
}

func loadFeatures(dir string) ([]Feature, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Feature
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		content, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		out = append(out, Feature{Name: strings.TrimSuffix(e.Name(), ".md"), Content: string(content)})
	}
	return out, nil
}

func loadRequirements(dir string) ([]Requirement, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Requirement
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		var data map[string]any
		if err := yaml.Unmarshal(raw, &data); err != nil {
			return nil, err
		}
		stem := strings.TrimSuffix(strings.TrimSuffix(name, ".yaml"), ".yml")
		out = append(out, Requirement{Name: stem, Data: data})
	}
	return out, nil
}

func writeJSON(path string, v any) error {
	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}
