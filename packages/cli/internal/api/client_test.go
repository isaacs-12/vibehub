package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestListPRs(t *testing.T) {
	prs := []PR{
		{ID: "pr-1", Title: "Add login", Author: "alice", Status: "open"},
		{ID: "pr-2", Title: "Fix bug", Author: "bob", Status: "merged"},
		{ID: "pr-3", Title: "Old feature", Author: "alice", Status: "closed"},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/projects/alice/app/prs" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.Error(w, "not found", 404)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(prs)
	}))
	defer srv.Close()

	client := &Client{BaseURL: srv.URL, Token: "test-token"}
	got, err := client.ListPRs("alice", "app")
	if err != nil {
		t.Fatalf("ListPRs failed: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 PRs, got %d", len(got))
	}
	if got[0].Title != "Add login" {
		t.Errorf("expected first PR title 'Add login', got %q", got[0].Title)
	}
	if got[2].Status != "closed" {
		t.Errorf("expected third PR status 'closed', got %q", got[2].Status)
	}
}

func TestClosePR(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/api/prs/pr-1/close" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.Error(w, "not found", 404)
			return
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("missing auth header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"closed"}`))
	}))
	defer srv.Close()

	client := &Client{BaseURL: srv.URL, Token: "test-token"}
	if err := client.ClosePR("pr-1"); err != nil {
		t.Fatalf("ClosePR failed: %v", err)
	}
}

func TestReopenPR(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/prs/pr-2/reopen" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.Error(w, "not found", 404)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"open"}`))
	}))
	defer srv.Close()

	client := &Client{BaseURL: srv.URL, Token: "test-token"}
	if err := client.ReopenPR("pr-2"); err != nil {
		t.Fatalf("ReopenPR failed: %v", err)
	}
}

func TestRetryCompile(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/prs/pr-3/retry" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.Error(w, "not found", 404)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"queued","jobId":"job-99"}`))
	}))
	defer srv.Close()

	client := &Client{BaseURL: srv.URL, Token: "test-token"}
	if err := client.RetryCompile("pr-3"); err != nil {
		t.Fatalf("RetryCompile failed: %v", err)
	}
}

func TestClosePR_AlreadyClosed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(409)
		w.Write([]byte(`{"error":"Cannot close an update that is already closed"}`))
	}))
	defer srv.Close()

	client := &Client{BaseURL: srv.URL, Token: "test-token"}
	err := client.ClosePR("pr-1")
	if err == nil {
		t.Fatal("expected error for already-closed PR")
	}
	if err.Error() != "Cannot close an update that is already closed" {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestReopenPR_AlreadyMerged(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(409)
		w.Write([]byte(`{"error":"Cannot reopen a merged update"}`))
	}))
	defer srv.Close()

	client := &Client{BaseURL: srv.URL, Token: "test-token"}
	err := client.ReopenPR("pr-1")
	if err == nil {
		t.Fatal("expected error for merged PR")
	}
	if err.Error() != "Cannot reopen a merged update" {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestReadRemote(t *testing.T) {
	dir := t.TempDir()
	vibeDir := filepath.Join(dir, ".vibe")
	os.MkdirAll(vibeDir, 0o755)

	remote := map[string]string{
		"owner":  "alice",
		"repo":   "my-app",
		"webUrl": "http://localhost:3000",
	}
	raw, _ := json.MarshalIndent(remote, "", "  ")
	os.WriteFile(filepath.Join(vibeDir, "remote.json"), raw, 0o644)

	rc, err := ReadRemote(dir)
	if err != nil {
		t.Fatalf("ReadRemote failed: %v", err)
	}
	if rc.Owner != "alice" || rc.Repo != "my-app" {
		t.Errorf("unexpected remote: %+v", rc)
	}
}

func TestReadRemote_Missing(t *testing.T) {
	dir := t.TempDir()
	_, err := ReadRemote(dir)
	if err == nil {
		t.Fatal("expected error when remote.json is missing")
	}
}

func TestNewClientFromRemote(t *testing.T) {
	rc := &RemoteConfig{Owner: "alice", Repo: "app", WebURL: "http://localhost:3000"}
	os.Setenv("VIBEHUB_TOKEN", "my-token")
	defer os.Unsetenv("VIBEHUB_TOKEN")

	client := NewClientFromRemote(rc)
	if client.BaseURL != "http://localhost:3000" {
		t.Errorf("unexpected BaseURL: %s", client.BaseURL)
	}
	if client.Token != "my-token" {
		t.Errorf("unexpected Token: %s", client.Token)
	}
}

func TestRevertPR(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/api/prs/pr-1/revert" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.Error(w, "not found", 404)
			return
		}
		w.WriteHeader(201)
		w.Write([]byte(`{"status":"created","pr":{"id":"pr-99","title":"Revert: Add auth","author":"alice","status":"open"}}`))
	}))
	defer srv.Close()

	client := &Client{BaseURL: srv.URL, Token: "test-token"}
	pr, err := client.RevertPR("pr-1")
	if err != nil {
		t.Fatalf("RevertPR failed: %v", err)
	}
	if pr.Title != "Revert: Add auth" {
		t.Errorf("expected title 'Revert: Add auth', got %q", pr.Title)
	}
	if pr.Status != "open" {
		t.Errorf("expected status 'open', got %q", pr.Status)
	}
}

func TestRevertPR_NotMerged(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(409)
		w.Write([]byte(`{"error":"Can only revert a merged update"}`))
	}))
	defer srv.Close()

	client := &Client{BaseURL: srv.URL, Token: "test-token"}
	_, err := client.RevertPR("pr-1")
	if err == nil {
		t.Fatal("expected error for non-merged PR")
	}
	if err.Error() != "Can only revert a merged update" {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestParseAPIError(t *testing.T) {
	tests := []struct {
		body     string
		status   int
		expected string
	}{
		{`{"error":"Not found"}`, 404, "Not found"},
		{`invalid json`, 500, "server returned 500"},
		{`{}`, 403, "server returned 403"},
	}

	for _, tt := range tests {
		err := parseAPIError([]byte(tt.body), tt.status)
		if err.Error() != tt.expected {
			t.Errorf("parseAPIError(%q, %d) = %q, want %q", tt.body, tt.status, err.Error(), tt.expected)
		}
	}
}
