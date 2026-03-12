package cmd

import (
	"github.com/spf13/cobra"
	"github.com/vibehub/cli/internal/project"
)

var readDir string

var readCmd = &cobra.Command{
	Use:   "read",
	Short: "Read the current project's vibe and print a summary",
	RunE: func(cmd *cobra.Command, args []string) error {
		p := project.New(readDir)
		return p.Read()
	},
}

func init() {
	readCmd.Flags().StringVarP(&readDir, "dir", "d", ".", "Project directory")
}
