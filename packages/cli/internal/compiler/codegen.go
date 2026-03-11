package compiler

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/vibehub/cli/internal/project"
	"google.golang.org/api/option"
)

const codegenModel = "gemini-2.5-flash-lite"
const maxFileChars = 8_000

func runCodegen(ctx context.Context, rootPath string, features []project.Feature, mapping project.Mapping, apiKey string) ([]FeatureResult, error) {
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, err
	}
	defer client.Close()
	model := client.GenerativeModel(codegenModel)

	var results []FeatureResult
	for _, f := range features {
		key := "features/" + f.Name + ".md"
		globs := mapping[key]
		result := FeatureResult{
			FeatureName: f.Name,
			FeaturePath: ".vibe/features/" + f.Name + ".md",
			MappedFiles: globs,
		}

		if len(globs) == 0 {
			result.CodegenStatus = "unchanged"
			results = append(results, result)
			continue
		}

		existing := readMappedFiles(rootPath, globs)
		if len(existing) == 0 {
			// No existing code under mapped path: generate a new file (e.g. src/overview.ts)
			updated, err := generateNewCode(ctx, model, f, globs)
			if err != nil {
				result.CodegenStatus = "failed"
				results = append(results, result)
				continue
			}
			if len(updated) > 0 {
				for _, u := range updated {
					abs := filepath.Join(rootPath, u.path)
					_ = os.MkdirAll(filepath.Dir(abs), 0o755)
					_ = os.WriteFile(abs, []byte(u.content), 0o644)
				}
				result.CodegenStatus = "generated"
			} else {
				result.CodegenStatus = "unchanged"
			}
			results = append(results, result)
			continue
		}

		updated, err := generateCode(ctx, model, f, existing)
		if err != nil {
			result.CodegenStatus = "failed"
			results = append(results, result)
			continue
		}

		modified := false
		for _, u := range updated {
			abs := filepath.Join(rootPath, u.path)
			old, _ := os.ReadFile(abs)
			if string(old) != u.content {
				_ = os.MkdirAll(filepath.Dir(abs), 0o755)
				_ = os.WriteFile(abs, []byte(u.content), 0o644)
				modified = true
			}
		}
		if modified {
			result.CodegenStatus = "generated"
		} else {
			result.CodegenStatus = "unchanged"
		}
		results = append(results, result)
	}
	return results, nil
}

type codeFile struct {
	path    string
	content string
}

func readMappedFiles(rootPath string, globs []string) []codeFile {
	var files []codeFile
	for _, g := range globs {
		abs := filepath.Join(rootPath, strings.TrimSuffix(g, "/**"))
		info, err := os.Stat(abs)
		if err != nil {
			continue
		}
		if info.IsDir() {
			// Collect first few source files from directory
			_ = filepath.WalkDir(abs, func(p string, d os.DirEntry, err error) error {
				if err != nil || d.IsDir() || len(files) >= 10 {
					return nil
				}
				ext := filepath.Ext(p)
				if ext == ".go" || ext == ".ts" || ext == ".tsx" || ext == ".js" || ext == ".py" || ext == ".rs" {
					raw, err := os.ReadFile(p)
					if err == nil {
						rel, _ := filepath.Rel(rootPath, p)
						content := string(raw)
						if len(content) > maxFileChars {
							content = content[:maxFileChars]
						}
						files = append(files, codeFile{path: rel, content: content})
					}
				}
				return nil
			})
		} else {
			raw, err := os.ReadFile(abs)
			if err == nil {
				content := string(raw)
				if len(content) > maxFileChars {
					content = content[:maxFileChars]
				}
				rel, _ := filepath.Rel(rootPath, abs)
				files = append(files, codeFile{path: rel, content: content})
			}
		}
		if len(files) >= 10 {
			break
		}
	}
	return files
}

func generateCode(ctx context.Context, model *genai.GenerativeModel, feature project.Feature, existing []codeFile) ([]codeFile, error) {
	var filesBlock strings.Builder
	for _, f := range existing {
		fmt.Fprintf(&filesBlock, "### %s\n```\n%s\n```\n\n", f.path, f.content)
	}

	prompt := fmt.Sprintf(`You are a senior software engineer. Update the existing code to implement this specification.

## Vibe Specification
`+"```markdown\n%s\n```"+`

## Existing Code
%s

Respond with ONLY a valid JSON array:
[{"filePath":"<exact path>","content":"<full updated file content>"}]

Return [] if no changes needed. No markdown fences.`, feature.Content, filesBlock.String())

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return nil, err
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
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var parsed []struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return nil, fmt.Errorf("invalid JSON from codegen: %w", err)
	}

	var out []codeFile
	for _, p := range parsed {
		if p.FilePath != "" && p.Content != "" {
			out = append(out, codeFile{path: p.FilePath, content: p.Content})
		}
	}
	return out, nil
}

// generateNewCode creates one new file when the mapped directory has no source files yet.
func generateNewCode(ctx context.Context, model *genai.GenerativeModel, feature project.Feature, globs []string) ([]codeFile, error) {
	baseDir := "src"
	if len(globs) > 0 {
		baseDir = strings.TrimSuffix(strings.TrimRight(globs[0], "/"), "/**")
		if baseDir == "" {
			baseDir = "src"
		}
	}
	// Use forward slashes so model returns portable path
	suggestedPath := baseDir + "/" + feature.Name + ".ts"
	if feature.Name == "" {
		suggestedPath = baseDir + "/index.ts"
	}

	prompt := fmt.Sprintf(`You are a senior software engineer. Create NEW code (one file) that implements this specification.
There is no existing code yet — generate an initial implementation.

## Vibe Specification
`+"```markdown\n%s\n```"+`

Respond with ONLY a valid JSON array with exactly one object:
[{"filePath":"%s","content":"<full file content>"}]

Use the exact filePath above. Choose an appropriate language (e.g. .ts, .tsx, .py) based on the spec; if the spec does not specify, use TypeScript. No markdown fences.`, feature.Content, suggestedPath)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return nil, err
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
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var parsed []struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return nil, fmt.Errorf("invalid JSON from codegen: %w", err)
	}

	var out []codeFile
	for _, p := range parsed {
		if p.FilePath != "" && p.Content != "" {
			out = append(out, codeFile{path: p.FilePath, content: p.Content})
		}
	}
	return out, nil
}
