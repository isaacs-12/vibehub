package compiler

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/fatih/color"
	"github.com/vibehub/cli/internal/project"
)

type Options struct {
	RootPath  string
	APIKey    string
	CheckOnly bool
}

type Compiler struct{ opts Options }

func New(opts Options) *Compiler { return &Compiler{opts: opts} }

func (c *Compiler) Compile(ctx context.Context) (*CompilationReport, error) {
	start := time.Now()
	report := &CompilationReport{StartedAt: start.Format(time.RFC3339)}

	p := project.New(c.opts.RootPath)
	snap, err := p.Load()
	if err != nil {
		return nil, err
	}
	report.ProjectName = snap.Name

	// Phase 1: Codegen
	codegenStart := time.Now()
	var partials []FeatureResult
	if c.opts.CheckOnly {
		report.Phases.Codegen = PhaseResult{Status: PhaseSkip, DurationMs: 0, Output: "--check: skipping codegen.", Errors: []CompileError{}}
		for _, f := range snap.Features {
			mapped := snap.Mapping["features/"+f.Name+".md"]
			partials = append(partials, FeatureResult{
				FeatureName: f.Name, FeaturePath: ".vibe/features/" + f.Name + ".md",
				MappedFiles: mapped, CodegenStatus: "unchanged",
			})
		}
	} else {
		partials, err = runCodegen(ctx, c.opts.RootPath, snap.Features, snap.Mapping, c.opts.APIKey)
		if err != nil {
			report.Phases.Codegen = PhaseResult{Status: PhaseFail, DurationMs: ms(codegenStart), Output: err.Error(), Errors: []CompileError{{Severity: "error", Message: err.Error()}}}
		} else {
			modified := 0
			var codegenErrors []CompileError
			for _, r := range partials {
				if r.CodegenStatus == "generated" {
					modified++
				}
				if r.CodegenStatus == "failed" {
					codegenErrors = append(codegenErrors, CompileError{Severity: "error", Message: "codegen failed for " + r.FeatureName})
				}
			}
			status := PhasePass
			if len(codegenErrors) > 0 {
				status = PhaseFail
			}
			report.Phases.Codegen = PhaseResult{
				Status: status, DurationMs: ms(codegenStart),
				Output: fmt.Sprintf("Code generation complete. %d file(s) modified.", modified),
				Errors: codegenErrors,
			}
		}
	}

	// Phase 2: Typecheck
	report.Phases.Typecheck = runTypecheck(c.opts.RootPath)

	// Phase 3: Tests
	report.Phases.Tests = runTests(c.opts.RootPath)

	// Phase 4: Requirements
	scores := runRequirementsCheck(ctx, c.opts.RootPath, snap.Features, snap.Mapping, partials, c.opts.APIKey)
	report.Phases.Requirements = scores.phase

	// Merge scores
	for i, p := range partials {
		if s, ok := scores.byFeature[p.FeatureName]; ok {
			partials[i].RequirementScore = s.score
			partials[i].RequirementIssues = s.issues
		} else {
			partials[i].RequirementScore = 100
			partials[i].RequirementIssues = []string{}
		}
	}
	report.Features = partials

	// Summary
	typeErrors := 0
	for _, e := range report.Phases.Typecheck.Errors {
		if e.Severity == "error" {
			typeErrors++
		}
	}
	avgScore := 100
	if len(partials) > 0 {
		sum := 0
		for _, f := range partials {
			sum += f.RequirementScore
		}
		avgScore = sum / len(partials)
	}
	modified := 0
	for _, f := range partials {
		if f.CodegenStatus == "generated" {
			modified++
		}
	}
	report.Summary = Summary{
		FeaturesProcessed: len(partials),
		CodeFilesModified: modified,
		TypeErrors:        typeErrors,
		TestsPassed:       scores.testsPassed,
		TestsFailed:       scores.testsFailed,
		RequirementScore:  avgScore,
	}

	hardFail := report.Phases.Typecheck.Status == PhaseFail || report.Phases.Tests.Status == PhaseFail
	softFail := avgScore < RequirementScoreThreshold
	switch {
	case hardFail:
		report.Status = "failed"
	case softFail:
		report.Status = "partial"
	default:
		report.Status = "success"
	}

	report.DurationMs = time.Since(start).Milliseconds()
	return report, nil
}

func ms(t time.Time) int64 { return time.Since(t).Milliseconds() }

// PrintReport renders the report to stdout with colours.
func PrintReport(r *CompilationReport) {
	hr := color.HiBlackString("  " + strings.Repeat("─", 58))

	color.New(color.Bold).Print("  Phases\n")
	fmt.Println()
	printPhase("Codegen", r.Phases.Codegen)
	printPhase("Typecheck", r.Phases.Typecheck)
	printPhase("Tests", r.Phases.Tests)
	printPhase("Requirements", r.Phases.Requirements)
	fmt.Println()

	// Type errors
	var typeErrs []CompileError
	for _, e := range r.Phases.Typecheck.Errors {
		if e.Severity == "error" {
			typeErrs = append(typeErrs, e)
		}
	}
	if len(typeErrs) > 0 {
		color.New(color.Bold, color.FgRed).Print("  TypeScript / Type Errors\n")
		fmt.Println()
		for _, e := range typeErrs {
			loc := ""
			if e.File != "" {
				loc = color.HiBlackString("%s:%d  ", e.File, e.Line)
			}
			fmt.Printf("    %s %s%s\n", color.RedString("✖"), loc, e.Message)
		}
		fmt.Println()
	}

	// Feature scores
	color.New(color.Bold).Print("  Feature Requirement Scores\n")
	fmt.Println()
	for _, f := range r.Features {
		scoreColor := color.New(color.FgRed)
		if f.RequirementScore >= 90 {
			scoreColor = color.New(color.FgGreen)
		} else if f.RequirementScore >= 75 {
			scoreColor = color.New(color.FgYellow)
		}
		bar := renderBar(f.RequirementScore, 20)
		statusGlyph := ""
		if f.CodegenStatus == "generated" {
			statusGlyph = color.HiBlackString(" ✎")
		} else if f.CodegenStatus == "failed" {
			statusGlyph = color.RedString(" ✖")
		}
		fmt.Printf("    %s%%  %s  %s%s\n",
			scoreColor.Sprintf("%3d", f.RequirementScore),
			bar,
			color.WhiteString(f.FeatureName),
			statusGlyph,
		)
		for i, issue := range f.RequirementIssues {
			if i >= 2 {
				break
			}
			fmt.Printf("          %s %s\n", color.HiBlackString("↳"), color.HiBlackString(issue))
		}
	}
	fmt.Println()

	fmt.Println(hr)
	s := r.Summary
	var statusLine string
	switch r.Status {
	case "success":
		statusLine = color.New(color.Bold, color.FgGreen).Sprint("  ✔ PASS")
	case "partial":
		statusLine = color.New(color.Bold, color.FgYellow).Sprint("  ⚠ PARTIAL")
	default:
		statusLine = color.New(color.Bold, color.FgRed).Sprint("  ✖ FAIL")
	}
	fmt.Printf("\n%s  %s\n", statusLine, color.HiBlackString("%s  ·  %dms", r.ProjectName, r.DurationMs))
	fmt.Printf("%s\n", color.HiBlackString("     %d features  ·  %d files modified", s.FeaturesProcessed, s.CodeFilesModified))
	fmt.Printf("%s\n", color.HiBlackString("     type errors: %d  ·  tests: %d passed / %d failed", s.TypeErrors, s.TestsPassed, s.TestsFailed))
	fmt.Printf("%s\n\n", color.HiBlackString("     avg requirement score: %d/100", s.RequirementScore))
}

func printPhase(name string, p PhaseResult) {
	icon := color.HiBlackString("–")
	statusText := color.HiBlackString("skip")
	switch p.Status {
	case PhasePass:
		icon = color.GreenString("✔")
		statusText = color.GreenString("pass")
	case PhaseFail:
		icon = color.RedString("✖")
		statusText = color.RedString("fail")
	}
	fmt.Printf("  %s %-14s %s  %s\n", icon, color.WhiteString(name), statusText, color.HiBlackString("%dms", p.DurationMs))
}

func renderBar(value, width int) string {
	filled := (value * width) / 100
	if filled < 0 {
		filled = 0
	}
	if filled > width {
		filled = width
	}
	var c *color.Color
	if value >= 90 {
		c = color.New(color.FgGreen)
	} else if value >= 75 {
		c = color.New(color.FgYellow)
	} else {
		c = color.New(color.FgRed)
	}
	return c.Sprint(strings.Repeat("█", filled)) + color.HiBlackString(strings.Repeat("░", width-filled))
}
