package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	Short: "Clone a VibeHub project from the remote",
	Long:  "Fetches the project snapshot from the VibeHub web backend and writes it to .vibe/. Example: vibe clone ims/test → ./ims-test/.vibe/",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ownerRepo := args[0]
		parts := strings.SplitN(ownerRepo, "/", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return fmt.Errorf("use owner/repo format (e.g. ims/my-app)")
		}
		owner, repo := parts[0], parts[1]

		webURL := os.Getenv("VIBEHUB_WEB_URL")
		if webURL == "" {
			webURL = "https://getvibehub.com"
		}

		url := fmt.Sprintf("%s/api/projects/%s/%s/snapshot", webURL, owner, repo)
		resp, err := http.Get(url) //nolint:noctx
		if err != nil {
			return fmt.Errorf("could not reach %s: %w", webURL, err)
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNotFound {
			return fmt.Errorf("project %s not found on %s", ownerRepo, webURL)
		}
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("server returned %d", resp.StatusCode)
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		var snap project.Snapshot
		if err := json.Unmarshal(body, &snap); err != nil {
			return fmt.Errorf("invalid snapshot from server: %w", err)
		}

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
		if err := p.ImportSnapshot(&snap); err != nil {
			return err
		}

		// Write remote.json so the desktop app and `vibe compile --push` know the origin
		remote := map[string]string{"owner": owner, "repo": repo, "webUrl": webURL}
		remotePath := filepath.Join(target, ".vibe", "remote.json")
		raw, _ := json.MarshalIndent(remote, "", "  ")
		_ = os.WriteFile(remotePath, raw, 0o644)

		abs, _ := filepath.Abs(target)
		color.Green("✔ Cloned %s → %s", ownerRepo, abs)
		color.HiBlack("  %d feature(s) · %d requirement(s)",
			len(snap.Features), len(snap.Requirements))
		fmt.Fprintf(os.Stderr, "  Open in Vibe Studio: Open Project → %s\n", abs)
		return nil
	},
}

func init() {
	cloneCmd.Flags().StringVarP(&cloneDir, "dir", "d", ".", "Parent directory to create the project in")
}
