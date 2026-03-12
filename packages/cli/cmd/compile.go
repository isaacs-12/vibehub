package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/vibehub/cli/internal/compiler"
)

var (
	compileDir    string
	compileAPIKey string
	compileCheck  bool
	compileJSON   bool
)

var compileCmd = &cobra.Command{
	Use:   "compile",
	Short: "Compile Vibes → code, then validate via typecheck, tests, and AI review",
	RunE: func(cmd *cobra.Command, args []string) error {
		apiKey := compileAPIKey
		if apiKey == "" {
			apiKey = os.Getenv("GEMINI_API_KEY")
		}
		if apiKey == "" {
			return fmt.Errorf("Gemini API key required (--api-key or GEMINI_API_KEY env var)")
		}

		if !compileJSON {
			fmt.Println()
			color.New(color.Bold, color.FgMagenta).Println("  Vibe Compiler")
			fmt.Println(color.HiBlackString("  " + strings.Repeat("─", 58)))
			if compileCheck {
				color.HiBlack("  mode: check-only (no code generation)")
			}
			fmt.Println()
		}

		c := compiler.New(compiler.Options{
			RootPath:  compileDir,
			APIKey:    apiKey,
			CheckOnly: compileCheck,
		})

		report, err := c.Compile(cmd.Context())
		if err != nil {
			return fmt.Errorf("fatal: %w", err)
		}

		if compileJSON {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(report)
		}

		compiler.PrintReport(report)

		if report.Status == "failed" {
			os.Exit(1)
		}
		return nil
	},
}

func init() {
	compileCmd.Flags().StringVarP(&compileDir, "dir", "d", ".", "Project directory")
	compileCmd.Flags().StringVarP(&compileAPIKey, "api-key", "k", "", "Gemini API key")
	compileCmd.Flags().BoolVar(&compileCheck, "check", false, "Validate only — do not generate or modify files")
	compileCmd.Flags().BoolVar(&compileJSON, "json", false, "Output CompilationReport as JSON")
}
