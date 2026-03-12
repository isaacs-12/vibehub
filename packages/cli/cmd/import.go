package cmd

import (
	"fmt"
	"os"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/vibehub/cli/internal/project"
	"github.com/vibehub/cli/internal/viber"
)

var importRepo string
var importAPIKey string

var importCmd = &cobra.Command{
	Use:   "import",
	Short: "Import an existing Git repo and extract its Vibes via Gemini",
	RunE: func(cmd *cobra.Command, args []string) error {
		apiKey := importAPIKey
		if apiKey == "" {
			apiKey = os.Getenv("GEMINI_API_KEY")
		}
		if apiKey == "" {
			return fmt.Errorf("Gemini API key required (--api-key or GEMINI_API_KEY env var)")
		}

		color.Cyan("Scanning repository at %s…", importRepo)

		v := viber.New(apiKey)
		p := project.New(importRepo)

		snapshot, err := v.Extract(cmd.Context(), importRepo)
		if err != nil {
			return fmt.Errorf("extraction failed: %w", err)
		}

		if err := p.ImportSnapshot(snapshot); err != nil {
			return fmt.Errorf("writing vibes: %w", err)
		}

		color.Green("✔ Vibes extracted and written to %s/.vibe/", importRepo)
		return nil
	},
}

func init() {
	importCmd.Flags().StringVarP(&importRepo, "repo", "r", ".", "Path to the existing Git repository")
	importCmd.Flags().StringVarP(&importAPIKey, "api-key", "k", "", "Gemini API key")
}
