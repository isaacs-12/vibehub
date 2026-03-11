package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/vibehub/cli/internal/project"
)

var cloneDir string

var cloneCmd = &cobra.Command{
	Use:   "clone <owner/repo>",
	Short: "Create a local directory and initialise a Vibe project (like git clone)",
	Long:  "Creates a directory (owner-repo), runs vibe init inside it, so you can open it in Vibe Studio. Example: vibe clone ims/test → ./ims-test/.vibe/",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ownerRepo := args[0]
		parts := strings.SplitN(ownerRepo, "/", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return fmt.Errorf("use owner/repo (e.g. ims/test)")
		}
		owner, repo := parts[0], parts[1]
		dirName := owner + "-" + repo
		parent := cloneDir
		if parent == "" {
			parent = "."
		}
		target := filepath.Join(parent, dirName)
		if err := os.MkdirAll(target, 0o755); err != nil {
			return err
		}
		p := project.New(target)
		if err := p.Init(repo); err != nil {
			return err
		}
		abs, _ := filepath.Abs(target)
		color.Green("✔ Cloned %s → %s", ownerRepo, abs)
		fmt.Fprintf(os.Stderr, "  Open in Vibe Studio: Open Project → %s\n", abs)
		return nil
	},
}

func init() {
	cloneCmd.Flags().StringVarP(&cloneDir, "dir", "d", ".", "Parent directory to create the project in")
}
