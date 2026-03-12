package cmd

import (
	"os"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "vibe",
	Short: "VibeHub CLI — vibe-first Git forge",
	Long:  "vibe lets you initialise, import, read, and compile Vibe projects.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		color.Red("Error: %v", err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(initCmd, cloneCmd, importCmd, readCmd, compileCmd)
}
