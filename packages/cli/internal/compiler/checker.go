package compiler

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/generative-ai-go/genai"
	"github.com/vibehub/cli/internal/project"
	"google.golang.org/api/option"
)

const checkerModel = "gemini-1.5-flash"
const maxCheckerChars = 6_000

func runRequirementsCheck(
	ctx context.Context,
	rootPath string,
	features []project.Feature,
	mapping project.Mapping,
	partials []FeatureResult,
	apiKey string,
) requirementsResult {
	start := time.Now()

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return requirementsResult{
			phase: PhaseResult{Status: PhaseFail, DurationMs: 0, Output: err.Error(),
				Errors: []CompileError{{Severity: "error", Message: err.Error()}}},
			byFeature: map[string]featureScore{},
		}
	}
	defer client.Close()
	model := client.GenerativeModel(checkerModel)

	byFeature := map[string]featureScore{}
	var phaseErrors []CompileError

	for _, partial := range partials {
		feat := findFeature(features, partial.FeatureName)
		if feat == nil {
			continue
		}
		if len(partial.MappedFiles) == 0 {
			byFeature[partial.FeatureName] = featureScore{score: 100, issues: []string{"No mapped files — cannot verify."}}
			continue
		}

		code := readCodeForCheck(rootPath, partial.MappedFiles)
		score, issues, err := checkFeature(ctx, model, *feat, code)
		if err != nil {
			byFeature[partial.FeatureName] = featureScore{score: 0, issues: []string{fmt.Sprintf("checker error: %v", err)}}
			phaseErrors = append(phaseErrors, CompileError{Severity: "error", Message: fmt.Sprintf("[%s] checker error: %v", partial.FeatureName, err)})
			continue
		}

		byFeature[partial.FeatureName] = featureScore{score: score, issues: issues}
		if score < RequirementScoreThreshold {
			sev := "warning"
			if score < 50 {
				sev = "error"
			}
			phaseErrors = append(phaseErrors, CompileError{Severity: sev,
				Message: fmt.Sprintf("[%s] score %d/100: %s", partial.FeatureName, score, strings.Join(issues, "; "))})
		}
	}

	hasError := false
	for _, e := range phaseErrors {
		if e.Severity == "error" {
			hasError = true
			break
		}
	}
	status := PhasePass
	if hasError {
		status = PhaseFail
	}

	avg := 0
	if len(byFeature) > 0 {
		sum := 0
		for _, s := range byFeature {
			sum += s.score
		}
		avg = sum / len(byFeature)
	}

	return requirementsResult{
		phase: PhaseResult{
			Status:     status,
			DurationMs: time.Since(start).Milliseconds(),
			Output:     fmt.Sprintf("Average requirement score: %d/100 across %d feature(s).", avg, len(byFeature)),
			Errors:     phaseErrors,
		},
		byFeature: byFeature,
	}
}

func findFeature(features []project.Feature, name string) *project.Feature {
	for i := range features {
		if features[i].Name == name {
			return &features[i]
		}
	}
	return nil
}

func readCodeForCheck(rootPath string, files []string) string {
	var parts []string
	total := 0
	for _, rel := range files {
		if total >= maxCheckerChars {
			break
		}
		abs := filepath.Join(rootPath, rel)
		raw, err := os.ReadFile(abs)
		if err != nil {
			continue
		}
		s := string(raw)
		if total+len(s) > maxCheckerChars {
			s = s[:maxCheckerChars-total]
		}
		parts = append(parts, fmt.Sprintf("### %s\n```\n%s\n```", rel, s))
		total += len(s)
	}
	if len(parts) == 0 {
		return "(no code found)"
	}
	return strings.Join(parts, "\n\n")
}

func checkFeature(ctx context.Context, model *genai.GenerativeModel, feat project.Feature, code string) (int, []string, error) {
	prompt := fmt.Sprintf(`You are a strict code reviewer. Verify that the implementation faithfully implements the specification.

## Vibe Specification
`+"```markdown\n%s\n```"+`

## Implementation
%s

Respond with ONLY valid JSON (no fences):
{"score":<0-100>,"issues":[<string>],"reasoning":"<one sentence>"}

Scoring: 90-100=all requirements met, 75-89=minor gaps, 50-74=some missing, 0-49=major gaps.`,
		feat.Content, code)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return 0, nil, err
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

	var parsed struct {
		Score  int      `json:"score"`
		Issues []string `json:"issues"`
	}
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return 0, nil, fmt.Errorf("invalid JSON from checker: %w", err)
	}
	score := parsed.Score
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	return score, parsed.Issues, nil
}
