package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/vibehub/cli/internal/api"
)

var updatesDir string

var updatesCmd = &cobra.Command{
	Use:   "updates",
	Short: "List and manage project updates",
	Long:  "List, close, reopen, and retry updates for the current project. Requires .vibe/remote.json (created by `vibe clone`).",
}

var updatesListCmd = &cobra.Command{
	Use:   "list",
	Short: "List updates for the project",
	RunE: func(cmd *cobra.Command, args []string) error {
		rc, client, err := resolveRemoteClient(updatesDir)
		if err != nil {
			return err
		}

		prs, err := client.ListPRs(rc.Owner, rc.Repo)
		if err != nil {
			return fmt.Errorf("failed to list updates: %w", err)
		}

		statusFilter, _ := cmd.Flags().GetString("status")

		var filtered []api.PR
		for _, pr := range prs {
			if statusFilter != "" && pr.Status != statusFilter {
				continue
			}
			filtered = append(filtered, pr)
		}

		if len(filtered) == 0 {
			if statusFilter != "" {
				color.HiBlack("No %s updates for %s/%s.", statusFilter, rc.Owner, rc.Repo)
			} else {
				color.HiBlack("No updates for %s/%s.", rc.Owner, rc.Repo)
			}
			return nil
		}

		color.New(color.Bold).Printf("  %s/%s — %d update(s)\n\n", rc.Owner, rc.Repo, len(filtered))
		for _, pr := range filtered {
			icon, clr := statusStyle(pr.Status)
			id := pr.ID
			if len(id) > 8 {
				id = id[:8]
			}
			fmt.Printf("  %s %-8s %s %s\n",
				clr.Sprint(icon),
				color.HiBlackString("#"+id),
				color.WhiteString(pr.Title),
				clr.Sprintf("(%s)", statusLabel(pr.Status)),
			)
		}
		fmt.Println()
		return nil
	},
}

var updatesCloseCmd = &cobra.Command{
	Use:   "close <update-id>",
	Short: "Close an open update without merging",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		_, client, err := resolveRemoteClient(updatesDir)
		if err != nil {
			return err
		}

		prID, err := resolveUpdateID(client, args[0], updatesDir)
		if err != nil {
			return err
		}

		if err := client.ClosePR(prID); err != nil {
			return fmt.Errorf("failed to close update: %w", err)
		}
		color.Green("✔ Update #%s closed.", args[0])
		return nil
	},
}

var updatesReopenCmd = &cobra.Command{
	Use:   "reopen <update-id>",
	Short: "Reopen a closed update",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		_, client, err := resolveRemoteClient(updatesDir)
		if err != nil {
			return err
		}

		prID, err := resolveUpdateID(client, args[0], updatesDir)
		if err != nil {
			return err
		}

		if err := client.ReopenPR(prID); err != nil {
			return fmt.Errorf("failed to reopen update: %w", err)
		}
		color.Green("✔ Update #%s reopened.", args[0])
		return nil
	},
}

var updatesRetryCmd = &cobra.Command{
	Use:   "retry <update-id>",
	Short: "Retry a failed compilation for an update",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		_, client, err := resolveRemoteClient(updatesDir)
		if err != nil {
			return err
		}

		prID, err := resolveUpdateID(client, args[0], updatesDir)
		if err != nil {
			return err
		}

		if err := client.RetryCompile(prID); err != nil {
			return fmt.Errorf("failed to retry compilation: %w", err)
		}
		color.Green("✔ Compilation retry queued for update #%s.", args[0])
		return nil
	},
}

var updatesRevertCmd = &cobra.Command{
	Use:   "revert <update-id>",
	Short: "Create a revert update for a merged update",
	Long:  "Creates a new open update that reverses the changes from a merged update. The revert goes through the normal review and merge flow, so changes made after the original are handled safely.",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		_, client, err := resolveRemoteClient(updatesDir)
		if err != nil {
			return err
		}

		prID, err := resolveUpdateID(client, args[0], updatesDir)
		if err != nil {
			return err
		}

		revertPR, err := client.RevertPR(prID)
		if err != nil {
			return fmt.Errorf("failed to create revert: %w", err)
		}

		id := revertPR.ID
		if len(id) > 8 {
			id = id[:8]
		}
		color.Green("✔ Revert update created: #%s — %s", id, revertPR.Title)
		color.HiBlack("  Review and merge it to apply the revert.")
		return nil
	},
}

func init() {
	updatesCmd.PersistentFlags().StringVarP(&updatesDir, "dir", "d", ".", "Project directory")
	updatesListCmd.Flags().StringP("status", "s", "", "Filter by status: open, merged, closed")

	updatesCmd.AddCommand(updatesListCmd, updatesCloseCmd, updatesReopenCmd, updatesRetryCmd, updatesRevertCmd)

	// Make `vibe updates` with no subcommand default to `list`
	updatesCmd.RunE = updatesListCmd.RunE
}

func resolveRemoteClient(dir string) (*api.RemoteConfig, *api.Client, error) {
	rc, err := api.ReadRemote(dir)
	if err != nil {
		return nil, nil, err
	}
	client := api.NewClientFromRemote(rc)
	if client.Token == "" {
		fmt.Fprintf(os.Stderr, "%s Set VIBEHUB_TOKEN to authenticate with the API.\n",
			color.YellowString("⚠"))
	}
	return rc, client, nil
}

// resolveUpdateID takes a short or full ID and finds the matching PR.
// Supports prefix matching (e.g., "c2d4ef29" matches the full UUID).
func resolveUpdateID(client *api.Client, input, dir string) (string, error) {
	// If it looks like a full UUID, use it directly
	if len(input) == 36 && strings.Count(input, "-") == 4 {
		return input, nil
	}

	// Otherwise try prefix match against the project's PRs
	rc, err := api.ReadRemote(dir)
	if err != nil {
		return "", err
	}
	prs, err := client.ListPRs(rc.Owner, rc.Repo)
	if err != nil {
		return "", fmt.Errorf("failed to list updates for ID resolution: %w", err)
	}

	var matches []api.PR
	for _, pr := range prs {
		if strings.HasPrefix(pr.ID, input) {
			matches = append(matches, pr)
		}
	}

	switch len(matches) {
	case 0:
		return "", fmt.Errorf("no update found matching %q", input)
	case 1:
		return matches[0].ID, nil
	default:
		return "", fmt.Errorf("ambiguous ID %q matches %d updates — use a longer prefix", input, len(matches))
	}
}

func statusStyle(status string) (string, *color.Color) {
	switch status {
	case "open":
		return "●", color.New(color.FgGreen)
	case "merged":
		return "◆", color.New(color.FgCyan)
	case "closed":
		return "✖", color.New(color.FgRed)
	default:
		return "○", color.New(color.FgWhite)
	}
}

func statusLabel(status string) string {
	switch status {
	case "open":
		return "in review"
	case "merged":
		return "applied"
	case "closed":
		return "closed"
	default:
		return status
	}
}
