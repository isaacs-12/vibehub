use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;
use walkdir::WalkDir;

/// Tracks the current run process so we can kill it when starting a new one. Uses Arc so we can pass into spawn.
pub struct RunState(pub Arc<Mutex<Option<u32>>>);

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct VibeFileEntry {
    pub name: String,
    pub path: String,
    pub content: String,
}

#[derive(Serialize, Deserialize)]
pub struct GitState {
    pub branch: String,
    pub branches: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct CodeFile {
    pub path: String,
    pub content: String,
}

#[derive(Serialize, Deserialize)]
pub struct ChatHistoryEntry {
    pub role: String,
    pub content: String,
}

// ─── File System Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_vibe_features(root: String) -> Result<Vec<VibeFileEntry>, String> {
    let features_dir = PathBuf::from(&root).join(".vibe").join("features");
    if !features_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    for entry in WalkDir::new(&features_dir).max_depth(3).sort_by_file_name() {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_file() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                let name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                let content = fs::read_to_string(path).unwrap_or_default();
                // Store path relative to root
                let rel = path
                    .strip_prefix(&root)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                entries.push(VibeFileEntry { name, path: rel, content });
            }
        }
    }
    Ok(entries)
}

#[tauri::command]
pub async fn write_vibe_file(
    root: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    let abs = PathBuf::from(&root).join(&relative_path);
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs, &content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_mapped_code(
    root: String,
    feature_path: String,
) -> Result<Vec<CodeFile>, String> {
    let mapping_path = PathBuf::from(&root).join(".vibe").join("mapping.json");
    if !mapping_path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&mapping_path).map_err(|e| e.to_string())?;
    let mapping: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    // Normalize the feature path key (strip leading ".vibe/")
    let key = feature_path.trim_start_matches(".vibe/").trim_start_matches('/');
    let globs = match mapping.get(key).or_else(|| mapping.get(&feature_path)) {
        Some(v) => v
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect::<Vec<_>>(),
        None => return Ok(vec![]),
    };

    let mut files = Vec::new();
    for pattern in &globs {
        // Simple directory/file match (no full glob expansion for MVP)
        let candidate = PathBuf::from(&root).join(pattern.trim_end_matches("/**"));
        if candidate.is_file() {
            let content = fs::read_to_string(&candidate).unwrap_or_default();
            files.push(CodeFile {
                path: pattern.clone(),
                content: content.chars().take(4000).collect(),
            });
        } else if candidate.is_dir() {
            for entry in WalkDir::new(&candidate).max_depth(2) {
                if let Ok(e) = entry {
                    if e.file_type().is_file() {
                        if let Ok(content) = fs::read_to_string(e.path()) {
                            let rel = e
                                .path()
                                .strip_prefix(&root)
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_default();
                            files.push(CodeFile {
                                path: rel,
                                content: content.chars().take(4000).collect(),
                            });
                        }
                    }
                }
                if files.len() >= 10 {
                    break;
                }
            }
        }
        if files.len() >= 10 {
            break;
        }
    }
    Ok(files)
}

/// Find first entry-point under src/ (e.g. src/index.ts or src/overview.ts). Prefer index.*.
fn find_src_entry(root: &std::path::Path) -> Option<String> {
    let src = root.join("src");
    if !src.is_dir() {
        return None;
    }
    let mut index_first: Vec<String> = Vec::new();
    let mut rest: Vec<String> = Vec::new();
    for e in WalkDir::new(&src).max_depth(3).into_iter().filter_map(|x| x.ok()) {
        if !e.file_type().is_file() {
            continue;
        }
        let ext = e.path().extension().and_then(|x| x.to_str()).unwrap_or("");
        if !["ts", "tsx", "js", "mjs"].contains(&ext) {
            continue;
        }
        let rel = e.path().strip_prefix(root).ok()?;
        let s = rel.to_string_lossy().replace('\\', "/");
        if rel.file_stem().and_then(|x| x.to_str()) == Some("index") {
            index_first.push(s);
        } else {
            rest.push(s);
        }
    }
    index_first.into_iter().next().or_else(|| rest.into_iter().next())
}

/// Kill process by pid (Unix: kill -9; Windows: taskkill /F /PID).
fn kill_pid(pid: u32) {
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill").args(["-9", &pid.to_string()]).output();
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill").args(["/F", "/PID", &pid.to_string()]).output();
    }
}

/// Ensure project can run: scaffold with Vite if no package.json, then start dev server.
/// Only one run at a time: kills previous process. Streams stdout/stderr via "run-output"; emits "run-ended" when process exits.
#[tauri::command]
pub async fn run_project(app: AppHandle, root: String, run_state: State<'_, RunState>) -> Result<String, String> {
    let root_path = PathBuf::from(&root);
    let pkg_path = root_path.join("package.json");

    if !pkg_path.exists() {
        scaffold_vite_app(&root_path)?;
    } else {
        // If dev script runs a single file (tsx), switch to Vite so Run starts a dev server and the user sees the app in the browser.
        ensure_vite_dev_server(&root_path)?;
    }

    // Ensure dependencies (e.g. vite) are installed so config and dev server can load.
    ensure_npm_install(&root_path).await?;

    // Kill previous run if any
    {
        let mut guard = run_state.0.lock().await;
        if let Some(pid) = *guard {
            kill_pid(pid);
        }
        *guard = None;
    }

    let mut child = tokio::process::Command::new("npm")
        .args(["run", "dev"])
        .current_dir(&root_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start npm run dev: {}", e))?;

    let pid = child.id();
    if let Some(pid) = pid {
        *run_state.0.lock().await = Some(pid);
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app_wait = app.clone();
    let app_out = app.clone();
    let app_err = app.clone();
    let state_arc = run_state.0.clone();

    tokio::spawn(async move {
        let _ = child.wait().await;
        *state_arc.lock().await = None;
        let _ = app_wait.emit("run-ended", ());
    });
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        while reader.read_line(&mut line).await.map(|n| n > 0).unwrap_or(false) {
            let trimmed = line.trim_end_matches('\n').trim_end_matches('\r').to_string();
            line.clear();
            if !trimmed.is_empty() {
                let _ = app_out.emit("run-output", serde_json::json!({ "line": trimmed }));
            }
        }
    });
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while reader.read_line(&mut line).await.map(|n| n > 0).unwrap_or(false) {
            let trimmed = line.trim_end_matches('\n').trim_end_matches('\r').to_string();
            line.clear();
            if !trimmed.is_empty() {
                let _ = app_err.emit("run-output", serde_json::json!({ "line": trimmed, "stderr": true }));
            }
        }
    });

    Ok("Running. Output below. Open the URL (e.g. http://localhost:5173) in your browser.".to_string())
}

/// Run npm install if node_modules is missing or vite (or other deps) are listed in package.json but not installed.
async fn ensure_npm_install(root: &std::path::Path) -> Result<(), String> {
    let node_modules = root.join("node_modules");
    let pkg_path = root.join("package.json");
    let need_install = if !node_modules.exists() {
        true
    } else if let Ok(raw) = fs::read_to_string(&pkg_path) {
        let pkg: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
        let has_vite = pkg.get("devDependencies").and_then(|d| d.get("vite")).is_some()
            || pkg.get("dependencies").and_then(|d| d.get("vite")).is_some();
        has_vite && !node_modules.join("vite").exists()
    } else {
        false
    };
    if !need_install {
        return Ok(());
    }
    let mut child = tokio::process::Command::new("npm")
        .args(["install"])
        .current_dir(root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("npm install failed. Run npm install in the project folder and try again.".to_string());
    }
    Ok(())
}

/// If package.json has a "tsx" dev script (single-file run), add Vite entry files and set dev to "vite" so Run serves a browser app.
/// When dev is already "vite" or "npx vite", ensure devDependencies.vite exists so the config can load.
fn ensure_vite_dev_server(root: &std::path::Path) -> Result<(), String> {
    let pkg_path = root.join("package.json");
    let raw = fs::read_to_string(&pkg_path).map_err(|e| e.to_string())?;
    let mut pkg: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let dev: String = pkg
        .get("scripts")
        .and_then(|s| s.get("dev"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let use_vite = dev.contains("tsx") || dev.is_empty() || dev == "vite" || dev == "npx vite";
    if !use_vite {
        return Ok(());
    }
    // Whenever we use Vite, ensure it's in devDependencies so vite.config.ts can resolve 'vite'.
    if pkg.get("devDependencies").is_none() {
        pkg["devDependencies"] = serde_json::json!({});
    }
    let dev_deps = pkg.get_mut("devDependencies").unwrap();
    if dev_deps.get("vite").is_none() {
        dev_deps["vite"] = serde_json::json!("^6.0.0");
    }
    if dev.contains("tsx") || dev.is_empty() {
        if pkg.get("scripts").is_none() {
            pkg["scripts"] = serde_json::json!({});
        }
        let scripts = pkg.get_mut("scripts").unwrap();
        scripts["dev"] = serde_json::json!("vite");
        if scripts.get("build").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
            scripts["build"] = serde_json::json!("vite build");
        }
    }
    fs::write(&pkg_path, serde_json::to_string_pretty(&pkg).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;

    if !dev.contains("tsx") && !dev.is_empty() {
        // Already using vite; we only needed to add the dependency.
        return Ok(());
    }
    let src = root.join("src");
    fs::create_dir_all(&src).map_err(|e| e.to_string())?;
    if !root.join("index.html").exists() {
        let index_html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vibe App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
"#;
        fs::write(root.join("index.html"), index_html).map_err(|e| e.to_string())?;
    }
    if !src.join("main.ts").exists() {
        let main_ts = r#"// Entry for your Vibe app. Run Vibe compile to generate your UI.
const root = document.getElementById('root')!;
root.innerHTML = '<h1>Vibe App</h1><p>Open <strong>http://localhost:5173</strong> — run Vibe to generate your app.</p>';
"#;
        fs::write(src.join("main.ts"), main_ts).map_err(|e| e.to_string())?;
    }
    if !root.join("vite.config.ts").exists() {
        fs::write(root.join("vite.config.ts"), "import { defineConfig } from 'vite';\nexport default defineConfig({ root: '.' });\n")
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Scaffold a minimal Vite app so "npm run dev" starts a dev server and serves the app.
fn scaffold_vite_app(root: &std::path::Path) -> Result<(), String> {
    let src = root.join("src");
    fs::create_dir_all(&src).map_err(|e| e.to_string())?;

    let pkg = serde_json::json!({
        "name": "vibe-app",
        "version": "1.0.0",
        "private": true,
        "type": "module",
        "scripts": { "dev": "vite", "build": "vite build" },
        "devDependencies": { "vite": "^6.0.0" }
    });
    fs::write(
        root.join("package.json"),
        serde_json::to_string_pretty(&pkg).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let index_html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vibe App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
"#;
    fs::write(root.join("index.html"), index_html).map_err(|e| e.to_string())?;

    let main_ts = r#"// Entry point for your Vibe app. Edit src/ or run Vibe compile to generate.
const root = document.getElementById('root')!;
root.innerHTML = '<h1>Vibe App</h1><p>Run <strong>Vibe</strong> in Vibe Studio to generate your app, or edit <code>src/</code>.</p>';
"#;
    fs::write(src.join("main.ts"), main_ts).map_err(|e| e.to_string())?;

    let vite_config = r#"import { defineConfig } from 'vite';
export default defineConfig({ root: '.' });
"#;
    fs::write(root.join("vite.config.ts"), vite_config).map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Git Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_init(root: String) -> Result<(), String> {
    let repo = git2::Repository::init(&root).map_err(|e| e.to_string())?;
    // Create initial commit so refs/heads/main exists (otherwise "New Branch" fails with UnbornBranch).
    let sig = git2::Signature::now("Vibe Studio", "vibe@local").map_err(|e| e.to_string())?;
    let tree_id = repo
        .treebuilder(None)
        .map_err(|e| e.to_string())?
        .write()
        .map_err(|e| e.to_string())?;
    repo.commit(
        Some("refs/heads/main"),
        &sig,
        &sig,
        "Initial commit",
        &repo.find_tree(tree_id).map_err(|e| e.to_string())?,
        &[],
    )
    .map_err(|e| e.to_string())?;
    repo.set_head("refs/heads/main").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_git_state(root: String) -> Result<GitState, String> {
    let repo = git2::Repository::open(&root).map_err(|e| e.to_string())?;
    // Unborn repo (no commits yet) has no HEAD; return main so UI works.
    let (branch, branches) = match repo.head() {
        Ok(head) => {
            let branch = head.shorthand().unwrap_or("HEAD").to_string();
            let mut branches = Vec::new();
            if let Ok(iter) = repo.branches(Some(git2::BranchType::Local)) {
                for (branch_ref, _) in iter.flatten() {
                    if let Some(name) = branch_ref.name().ok().flatten() {
                        branches.push(name.to_string());
                    }
                }
            }
            (branch, branches)
        }
        Err(e) if e.code() == git2::ErrorCode::UnbornBranch || e.message().contains("not found") => {
            ("main".to_string(), vec!["main".to_string()])
        }
        Err(e) => return Err(e.to_string()),
    };
    Ok(GitState { branch, branches })
}

#[tauri::command]
pub async fn git_checkout(root: String, branch: String) -> Result<(), String> {
    let repo = git2::Repository::open(&root).map_err(|e| e.to_string())?;
    let (obj, reference) = repo.revparse_ext(&branch).map_err(|e| e.to_string())?;
    repo.checkout_tree(&obj, None).map_err(|e| e.to_string())?;
    if let Some(r) = reference {
        repo.set_head(r.name().unwrap_or("")).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Create initial commit if repo has no commits (unborn), so branch operations work.
/// If HEAD is unborn but refs/heads/main or refs/heads/master already has a commit, just point HEAD at it.
fn ensure_initial_commit(repo: &git2::Repository) -> Result<(), String> {
    if repo.head().and_then(|h| h.peel_to_commit()).is_ok() {
        return Ok(());
    }
    // HEAD is unborn; maybe refs/heads/main or refs/heads/master already has a commit (e.g. from a previous run).
    for branch_ref in ["refs/heads/main", "refs/heads/master"] {
        if let Ok(r) = repo.find_reference(branch_ref) {
            if r.peel_to_commit().is_ok() {
                repo.set_head(branch_ref).map_err(|e| e.to_string())?;
                return Ok(());
            }
        }
    }
    let sig = git2::Signature::now("Vibe Studio", "vibe@local").map_err(|e| e.to_string())?;
    let tree_id = repo.treebuilder(None).map_err(|e| e.to_string())?.write().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    repo.commit(Some("refs/heads/main"), &sig, &sig, "Initial commit", &tree, &[])
        .map_err(|e| e.to_string())?;
    repo.set_head("refs/heads/main").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn git_create_branch(root: String, name: String) -> Result<(), String> {
    let repo = git2::Repository::open(&root).map_err(|e| e.to_string())?;
    ensure_initial_commit(&repo)?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let branch = repo.branch(&name, &commit, false).map_err(|e| e.to_string())?;
    let refname = branch.get().name().ok_or("Invalid branch ref name")?;
    repo.set_head(refname).map_err(|e| e.to_string())?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── AI Commands ──────────────────────────────────────────────────────────────

const CODEGEN_MODEL: &str = "gemini-2.5-flash-lite";
const MAX_FILE_CHARS: usize = 8_000;

async fn call_gemini(client: &reqwest::Client, api_key: &str, prompt: &str) -> Result<String, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        CODEGEN_MODEL, api_key
    );
    let body = serde_json::json!({
        "contents": [{ "role": "user", "parts": [{ "text": prompt }] }]
    });
    let resp = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if let Some(err_obj) = json.get("error") {
        let msg = err_obj.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown API error");
        return Err(format!("Gemini API: {}", msg));
    }
    let candidates = json.get("candidates").and_then(|c| c.as_array());
    match candidates.and_then(|c| c.first()) {
        Some(cand) => {
            let text = cand
                .get("content")
                .and_then(|c| c.get("parts"))
                .and_then(|p| p.as_array())
                .and_then(|p| p.first())
                .and_then(|p| p.get("text"))
                .and_then(|t| t.as_str())
                .ok_or_else(|| "No text in Gemini response".to_string())?;
            Ok(text.to_string())
        }
        None => Err("No response from model".to_string()),
    }
}

/// Read existing source files under mapped globs (dirs or single files). Max 10 files, 8k chars each.
fn read_mapped_files(root: &std::path::Path, globs: &[String]) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let exts = ["go", "ts", "tsx", "js", "py", "rs"];
    for g in globs {
        let trim = g.trim_end_matches('/').trim_end_matches("/**");
        let abs = root.join(trim);
        if let Ok(meta) = fs::metadata(&abs) {
            if meta.is_dir() {
                for entry in WalkDir::new(&abs).into_iter().filter_map(|e| e.ok()) {
                    if out.len() >= 10 {
                        break;
                    }
                    let p = entry.path();
                    if !p.is_file() {
                        continue;
                    }
                    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                    if !exts.contains(&ext) {
                        continue;
                    }
                    if let Ok(content) = fs::read_to_string(p) {
                        let rel = p
                            .strip_prefix(root)
                            .map(|x| x.to_string_lossy().replace('\\', "/"))
                            .unwrap_or_else(|_| p.to_string_lossy().to_string());
                        let content = if content.len() > MAX_FILE_CHARS {
                            content.chars().take(MAX_FILE_CHARS).collect::<String>()
                        } else {
                            content
                        };
                        out.push((rel, content));
                    }
                }
            } else if let Ok(content) = fs::read_to_string(&abs) {
                let rel = abs
                    .strip_prefix(root)
                    .map(|x| x.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| abs.to_string_lossy().to_string());
                let content = if content.len() > MAX_FILE_CHARS {
                    content.chars().take(MAX_FILE_CHARS).collect::<String>()
                } else {
                    content
                };
                out.push((rel, content));
            }
        }
        if out.len() >= 10 {
            break;
        }
    }
    out
}

/// Detect preferred output language from vibe spec text (e.g. "python only", "written in python", "in TypeScript").
/// Returns (file_extension, language_instruction for prompt).
fn preferred_language_from_vibe(content: &str) -> (&'static str, &'static str) {
    let lower = content.to_lowercase();
    if lower.contains("python only") || lower.contains("written in python") || lower.contains("in python")
        || (lower.contains("python") && lower.contains("only"))
    {
        return ("py", "The specification requests Python. Generate only Python code and use a .py file.");
    }
    if lower.contains("python") {
        return ("py", "The specification requests Python. Generate only Python code and use a .py file.");
    }
    if lower.contains("golang") || lower.contains(" in go ") || lower.contains("written in go") {
        return ("go", "The specification requests Go. Generate only Go code and use a .go file.");
    }
    if lower.contains("rust") && (lower.contains("language") || lower.contains("written") || lower.contains("in rust") || lower.contains("only")) {
        return ("rs", "The specification requests Rust. Generate only Rust code and use a .rs file.");
    }
    if lower.contains("typescript") || lower.contains("javascript") {
        return ("ts", "Use TypeScript or JavaScript as appropriate.");
    }
    ("ts", "Use TypeScript or the language that fits the spec.")
}

fn parse_codegen_response(text: &str) -> Result<Vec<(String, String)>, String> {
    let text = text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let arr: Vec<serde_json::Value> = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for v in arr {
        if let (Some(path), Some(content)) = (
            v.get("filePath").and_then(|x| x.as_str()),
            v.get("content").and_then(|x| x.as_str()),
        ) {
            if !path.is_empty() && !content.is_empty() {
                out.push((path.to_string(), content.to_string()));
            }
        }
    }
    Ok(out)
}

// Compilation is currently one codegen step per feature. To work within model context limits
// and improve reliability, this can be split into task-specific phases (each a separate model
// call): e.g. scaffold (package.json, tsconfig, entry), codegen (vibe → code per feature),
// validate (typecheck/lint). Each phase can be a dedicated "agent" invoked in sequence.
#[tauri::command]
pub async fn compile_vibes(root: String) -> Result<String, String> {
    let api_key = std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not set. Set it in .env and run the app with `make desktop`.")?;

    let root_path = PathBuf::from(&root);
    let vibe_dir = root_path.join(".vibe");
    let features_dir = vibe_dir.join("features");
    let mapping_path = vibe_dir.join("mapping.json");

    // Load features: name and content from .vibe/features/*.md
    let mut features: Vec<(String, String)> = Vec::new();
    for entry in fs::read_dir(&features_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let n = entry.file_name();
        let n = n.to_str().ok_or("Invalid filename")?;
        if !n.ends_with(".md") {
            continue;
        }
        let name = n.strip_suffix(".md").unwrap_or(n).to_string();
        let content = fs::read_to_string(entry.path()).unwrap_or_default();
        features.push((name, content));
    }

    if features.is_empty() {
        return Ok("No vibe feature files (.vibe/features/*.md) found.".to_string());
    }

    // Load or create mapping; auto-add missing feature keys with default ["src/"]
    let mut mapping: HashMap<String, Vec<String>> = if mapping_path.exists() {
        let raw = fs::read_to_string(&mapping_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        HashMap::new()
    };

    for (name, _) in &features {
        let key = format!("features/{}.md", name);
        if !mapping.contains_key(&key) {
            mapping.insert(key, vec!["src/".to_string()]);
        }
    }
    fs::create_dir_all(&vibe_dir).map_err(|e| e.to_string())?;
    let mapping_json = serde_json::to_string_pretty(&mapping).map_err(|e| e.to_string())?;
    fs::write(&mapping_path, &mapping_json).map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();
    let mut generated = 0usize;
    let mut errors = Vec::new();

    for (name, content) in &features {
        let key = format!("features/{}.md", name);
        let globs = mapping.get(&key).cloned().unwrap_or_default();
        if globs.is_empty() {
            continue;
        }

        let existing = read_mapped_files(&root_path, &globs);

        let (ext, lang_instruction) = preferred_language_from_vibe(content);

        let prompt = if existing.is_empty() {
            let base_dir = globs[0].trim_end_matches('/').trim_end_matches("/**");
            let base_dir = if base_dir.is_empty() { "src" } else { base_dir };
            let suggested_path = format!("{}/{}", base_dir, if name.is_empty() { "index" } else { name });
            let suggested_path = format!("{}.{}", suggested_path.trim_end_matches('.'), ext);
            format!(
                r#"You are a senior software engineer. Create NEW code (one file) that implements this specification.
There is no existing code yet — generate an initial implementation.
{}.

## Vibe Specification
```markdown
{}
```

Respond with ONLY a valid JSON array with exactly one object:
[{{"filePath":"{}","content":"<full file content>"}}]
Use the exact filePath above. No markdown fences."#,
                lang_instruction,
                content,
                suggested_path
            )
        } else {
            let files_block: String = existing
                .iter()
                .map(|(path, c)| format!("### {}\n```\n{}\n```\n\n", path, c))
                .collect();
            format!(
                r#"You are a senior software engineer. Update the existing code to implement this specification.
{}.

## Vibe Specification
```markdown
{}
```

## Existing Code
{}

Respond with ONLY a valid JSON array:
[{{"filePath":"<exact path>","content":"<full updated file content>"}}]
Return [] if no changes needed. No markdown fences."#,
                lang_instruction,
                content,
                files_block
            )
        };

        match call_gemini(&client, &api_key, &prompt).await {
            Ok(text) => {
                match parse_codegen_response(&text) {
                    Ok(files) => {
                        for (rel_path, file_content) in files {
                            let abs = root_path.join(&rel_path);
                            if let Some(parent) = abs.parent() {
                                let _ = fs::create_dir_all(parent);
                            }
                            if fs::write(&abs, &file_content).is_ok() {
                                generated += 1;
                            }
                        }
                    }
                    Err(e) => errors.push(format!("{}: parse error: {}", name, e)),
                }
            }
            Err(e) => errors.push(format!("{}: {}", name, e)),
        }
    }

    if !errors.is_empty() {
        return Err(errors.join("\n"));
    }
    Ok(format!(
        "Compilation finished. {} feature(s) processed, {} file(s) written.",
        features.len(),
        generated
    ))
}

#[tauri::command]
pub async fn chat_with_vibes(
    root: String,
    user_message: String,
    vibe_context: String,
    feature_name: String,
    history: Vec<ChatHistoryEntry>,
) -> Result<String, String> {
    let api_key = std::env::var("GEMINI_API_KEY")
        .map_err(|_| "GEMINI_API_KEY not set. Set it in your environment.".to_string())?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={api_key}"
    );

    // Build contents array (history + new user message)
    let mut contents: Vec<serde_json::Value> = history
        .iter()
        .map(|h| {
            serde_json::json!({
                "role": if h.role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": h.content }]
            })
        })
        .collect();

    let system_context = format!(
        "You are an expert software architect and product manager working inside Vibe Studio. \
         You help users edit their 'Vibe' files — human-readable feature specifications that drive code generation.\n\n\
         Current project root: {root}\n\
         Current feature: {feature_name}\n\n\
         Current Vibe file content:\n```markdown\n{vibe_context}\n```\n\n\
         When the user asks to update multiple features, respond with the full updated Markdown for each, \
         clearly labeled with the feature name."
    );

    // Prepend system context as a user turn (Gemini doesn't have a system role)
    contents.insert(
        0,
        serde_json::json!({
            "role": "user",
            "parts": [{ "text": system_context }]
        }),
    );
    contents.insert(
        1,
        serde_json::json!({
            "role": "model",
            "parts": [{ "text": "Understood. I'm ready to help you refine your Vibe files." }]
        }),
    );
    contents.push(serde_json::json!({
        "role": "user",
        "parts": [{ "text": user_message }]
    }));

    let body = serde_json::json!({ "contents": contents });
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    // Handle API error body (e.g. 400/429/500 with {"error": {"message": "..."}})
    if let Some(err_obj) = json.get("error") {
        let msg = err_obj
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown API error");
        return Err(format!("Gemini API error: {}", msg));
    }

    let candidates = json.get("candidates").and_then(|c| c.as_array());
    let text = match candidates.and_then(|c| c.first()) {
        Some(cand) => {
            let parts = cand.get("content").and_then(|c| c.get("parts")).and_then(|p| p.as_array());
            match parts.and_then(|p| p.first()).and_then(|p| p.get("text")).and_then(|t| t.as_str()) {
                Some(s) => s.to_string(),
                None => {
                    let reason = cand.get("finishReason").and_then(|r| r.as_str()).unwrap_or("unknown");
                    format!("No text in response (finishReason: {}). Try rephrasing.", reason)
                }
            }
        }
        None => {
            let feedback = json.get("promptFeedback").and_then(|f| f.get("blockReason")).and_then(|r| r.as_str());
            match feedback {
                Some(r) => format!("Response blocked (reason: {}). Try rephrasing.", r),
                None => "No response from model. Try again or rephrase.".to_string(),
            }
        }
    };
    Ok(text)
}
