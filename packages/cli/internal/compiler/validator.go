package compiler

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func runTypecheck(rootPath string) PhaseResult {
	start := time.Now()

	tsconfig := findTsConfig(rootPath)
	if tsconfig == "" {
		return PhaseResult{Status: PhaseSkip, DurationMs: 0, Output: "No tsconfig.json found — skipping typecheck.", Errors: []CompileError{}}
	}

	cmd := exec.Command("npx", "tsc", "--noEmit", "--project", tsconfig)
	cmd.Dir = rootPath
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))
	errors := parseTscOutput(output)

	status := PhasePass
	for _, e := range errors {
		if e.Severity == "error" {
			status = PhaseFail
			break
		}
	}
	_ = err // tsc exits non-zero on errors; we detect via parsed errors
	return PhaseResult{Status: status, DurationMs: time.Since(start).Milliseconds(), Output: output, Errors: errors}
}

func findTsConfig(root string) string {
	candidates := []string{
		"tsconfig.json", "tsconfig.app.json",
		"packages/web/tsconfig.json", "packages/cli/tsconfig.json",
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(root, c)); err == nil {
			return filepath.Join(root, c)
		}
	}
	return ""
}

var tscRe = regexp.MustCompile(`^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$`)

func parseTscOutput(output string) []CompileError {
	var errors []CompileError
	for _, line := range strings.Split(output, "\n") {
		m := tscRe.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil {
			continue
		}
		lineNum, _ := strconv.Atoi(m[2])
		colNum, _ := strconv.Atoi(m[3])
		errors = append(errors, CompileError{
			File: m[1], Line: lineNum, Column: colNum,
			Severity: m[4], Message: m[5],
		})
	}
	return errors
}

type testResult struct {
	phase       PhaseResult
	testsPassed int
	testsFailed int
}

type requirementsResult struct {
	phase       PhaseResult
	byFeature   map[string]featureScore
	testsPassed int
	testsFailed int
}

type featureScore struct {
	score  int
	issues []string
}

func runTests(rootPath string) PhaseResult {
	start := time.Now()
	runner, cmdArgs := detectTestRunner(rootPath)
	if runner == "" {
		return PhaseResult{Status: PhaseSkip, DurationMs: 0, Output: "No test runner detected — skipping.", Errors: []CompileError{}}
	}

	cmd := exec.Command(runner, cmdArgs...)
	cmd.Dir = rootPath
	cmd.Env = append(os.Environ(), "CI=true", "FORCE_COLOR=0")
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))

	errors := extractTestErrors(output)
	status := PhasePass
	if err != nil && len(errors) > 0 {
		status = PhaseFail
	}
	return PhaseResult{Status: status, DurationMs: time.Since(start).Milliseconds(), Output: output, Errors: errors}
}

func detectTestRunner(root string) (string, []string) {
	// Check for go test
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err == nil {
		return "go", []string{"test", "./...", "-v"}
	}
	// Check for cargo test
	if _, err := os.Stat(filepath.Join(root, "Cargo.toml")); err == nil {
		return "cargo", []string{"test"}
	}
	// Check for pytest
	if _, err := os.Stat(filepath.Join(root, "pytest.ini")); err == nil {
		return "python", []string{"-m", "pytest", "-v", "--tb=short"}
	}
	if _, err := os.Stat(filepath.Join(root, "pyproject.toml")); err == nil {
		return "python", []string{"-m", "pytest", "-v", "--tb=short"}
	}
	// Node: check package.json for test script
	pkgJSON := filepath.Join(root, "package.json")
	if raw, err := os.ReadFile(pkgJSON); err == nil {
		s := string(raw)
		if strings.Contains(s, `"vitest"`) {
			return "npx", []string{"vitest", "run", "--reporter=verbose"}
		}
		if strings.Contains(s, `"jest"`) {
			return "npx", []string{"jest", "--no-coverage", "--verbose"}
		}
	}
	return "", nil
}

func extractTestErrors(output string) []CompileError {
	var errors []CompileError
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "--- FAIL") || strings.HasPrefix(line, "FAIL") ||
			strings.HasPrefix(line, "✖") || strings.HasPrefix(line, "× ") ||
			strings.HasPrefix(line, "FAILED") {
			errors = append(errors, CompileError{Severity: "error", Message: line})
		}
		if len(errors) >= 20 {
			break
		}
	}
	return errors
}

func countTests(output string) (passed, failed int) {
	for _, line := range strings.Split(output, "\n") {
		if strings.Contains(line, "passed") {
			fmt.Sscanf(line, "%d passed", &passed)
		}
		if strings.Contains(line, "failed") {
			fmt.Sscanf(line, "%d failed", &failed)
		}
		if strings.Contains(line, "--- PASS") {
			passed++
		}
		if strings.Contains(line, "--- FAIL") {
			failed++
		}
	}
	return
}
