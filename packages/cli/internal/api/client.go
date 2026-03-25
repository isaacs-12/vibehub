package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Client talks to the VibeHub web API.
type Client struct {
	BaseURL string
	Token   string
}

// RemoteConfig is the contents of .vibe/remote.json.
type RemoteConfig struct {
	Owner  string `json:"owner"`
	Repo   string `json:"repo"`
	WebURL string `json:"webUrl"`
}

// PR is a subset of the VibePR type returned by the API.
type PR struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Author    string `json:"author"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}

// NewClientFromEnv creates a client from VIBEHUB_WEB_URL and VIBEHUB_TOKEN env vars.
func NewClientFromEnv() *Client {
	url := os.Getenv("VIBEHUB_WEB_URL")
	if url == "" {
		url = "https://getvibehub.com"
	}
	return &Client{
		BaseURL: strings.TrimRight(url, "/"),
		Token:   os.Getenv("VIBEHUB_TOKEN"),
	}
}

// ReadRemote reads .vibe/remote.json from the given project directory.
func ReadRemote(dir string) (*RemoteConfig, error) {
	path := filepath.Join(dir, ".vibe", "remote.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("no .vibe/remote.json found — run `vibe clone` first or create the file manually")
	}
	var rc RemoteConfig
	if err := json.Unmarshal(raw, &rc); err != nil {
		return nil, fmt.Errorf("invalid .vibe/remote.json: %w", err)
	}
	if rc.Owner == "" || rc.Repo == "" {
		return nil, fmt.Errorf(".vibe/remote.json missing owner or repo")
	}
	if rc.WebURL != "" {
		// Use per-project URL if set
	}
	return &rc, nil
}

// NewClientFromRemote creates a client using the remote config's URL (or env fallback).
func NewClientFromRemote(rc *RemoteConfig) *Client {
	url := rc.WebURL
	if url == "" {
		url = os.Getenv("VIBEHUB_WEB_URL")
	}
	if url == "" {
		url = "https://getvibehub.com"
	}
	return &Client{
		BaseURL: strings.TrimRight(url, "/"),
		Token:   os.Getenv("VIBEHUB_TOKEN"),
	}
}

func (c *Client) do(method, path string, body any) ([]byte, int, error) {
	var reqBody io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reqBody = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, reqBody)
	if err != nil {
		return nil, 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return respBody, resp.StatusCode, nil
}

// ListPRs lists all updates for a project.
func (c *Client) ListPRs(owner, repo string) ([]PR, error) {
	body, status, err := c.do("GET", fmt.Sprintf("/api/projects/%s/%s/prs", owner, repo), nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("server returned %d: %s", status, string(body))
	}
	var prs []PR
	if err := json.Unmarshal(body, &prs); err != nil {
		return nil, fmt.Errorf("invalid response: %w", err)
	}
	return prs, nil
}

// ClosePR closes an open update.
func (c *Client) ClosePR(prID string) error {
	body, status, err := c.do("POST", fmt.Sprintf("/api/prs/%s/close", prID), nil)
	if err != nil {
		return err
	}
	if status != 200 {
		return parseAPIError(body, status)
	}
	return nil
}

// ReopenPR reopens a closed update.
func (c *Client) ReopenPR(prID string) error {
	body, status, err := c.do("POST", fmt.Sprintf("/api/prs/%s/reopen", prID), nil)
	if err != nil {
		return err
	}
	if status != 200 {
		return parseAPIError(body, status)
	}
	return nil
}

// RetryCompile retries compilation for a failed update.
func (c *Client) RetryCompile(prID string) error {
	body, status, err := c.do("POST", fmt.Sprintf("/api/prs/%s/retry", prID), nil)
	if err != nil {
		return err
	}
	if status != 200 {
		return parseAPIError(body, status)
	}
	return nil
}

func parseAPIError(body []byte, status int) error {
	var errResp struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(body, &errResp) == nil && errResp.Error != "" {
		return fmt.Errorf("%s", errResp.Error)
	}
	return fmt.Errorf("server returned %d", status)
}
