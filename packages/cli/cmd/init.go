package cmd

import (
	"fmt"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/vibehub/cli/internal/project"
)

var initDir string

var initCmd = &cobra.Command{
	Use:   "init [name]",
	Short: "Initialise a new VibeHub project in the current directory",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := "my-vibe-project"
		if len(args) > 0 {
			name = args[0]
		}
		p := project.New(initDir)
		if err := p.Init(name); err != nil {
			return err
		}
		color.Green("✔ Initialised vibe project in %s/.vibe/", initDir)
		return nil
	},
}

func init() {
	initCmd.Flags().StringVarP(&initDir, "dir", "d", ".", "Target directory")
	_ = fmt.Sprintf("") // suppress unused import warning during scaffolding
}
