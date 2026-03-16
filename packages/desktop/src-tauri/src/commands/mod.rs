use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use serde::{Deserialize, Serialize};
use serde_json;
use tauri::{AppHandle, Emitter, State};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;
use walkdir::WalkDir;

/// Tracks the current run process so we can kill it when starting a new one. Uses Arc so we can pass into spawn.
pub struct RunState(pub Arc<Mutex<Option<u32>>>);

// ─── Vibe grammar helpers ─────────────────────────────────────────────────────

/// Extract the YAML frontmatter block from a vibe file (content between the first --- delimiters).
fn extract_frontmatter(content: &str) -> Option<&str> {
    let content = content.trim_start();
    if !content.starts_with("---") { return None; }
    let rest = &content[3..];
    // Skip the newline after the opening ---
    let rest = rest.trim_start_matches('\n').trim_start_matches("\r\n");
    let end = rest.find("\n---")?;
    Some(&rest[..end])
}

/// Parse an inline list field from frontmatter: `Uses: [A, B, C]` → ["A", "B", "C"]
fn parse_fm_inline_list(fm: &str, field: &str) -> Vec<String> {
    let prefix = format!("{}:", field);
    for line in fm.lines() {
        if let Some(rest) = line.strip_prefix(&prefix) {
            let inner = rest.trim().trim_start_matches('[').trim_end_matches(']');
            return inner.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        }
    }
    Vec::new()
}

/// Parse a block list field from frontmatter:
///   Never:
///     - item one
///     - item two
fn parse_fm_block_list(fm: &str, field: &str) -> Vec<String> {
    let prefix = format!("{}:", field);
    let mut in_field = false;
    let mut items = Vec::new();
    for line in fm.lines() {
        if line.starts_with(&prefix) {
            // Could also be inline: Never: [...]
            let rest = line[prefix.len()..].trim();
            if rest.starts_with('[') {
                let inner = rest.trim_start_matches('[').trim_end_matches(']');
                items = inner.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                break;
            }
            in_field = true;
            continue;
        }
        if in_field {
            if let Some(item) = line.trim().strip_prefix("- ") {
                items.push(item.to_string());
            } else if !line.starts_with(' ') && !line.trim().is_empty() {
                break;
            }
        }
    }
    items
}

/// Convert a PascalCase grammar name to a kebab-case slug: "UserAuth" → "user-auth"
fn grammar_name_to_slug(name: &str) -> String {
    let mut result = String::new();
    for (i, ch) in name.chars().enumerate() {
        if ch.is_uppercase() && i > 0 {
            result.push('-');
        }
        result.push(ch.to_lowercase().next().unwrap_or(ch));
    }
    result
}

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

#[derive(Serialize, Deserialize)]
pub struct PushResult {
    pub pr_id: String,
    pub url: String,
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

/// Delete a single vibe file by relative path.
#[tauri::command]
pub async fn delete_vibe_file(root: String, relative_path: String) -> Result<(), String> {
    let abs = PathBuf::from(&root).join(&relative_path);
    fs::remove_file(&abs).map_err(|e| e.to_string())
}

/// Kill the currently running project process, if any.
#[tauri::command]
pub async fn stop_project(run_state: State<'_, RunState>) -> Result<(), String> {
    let mut guard = run_state.0.lock().await;
    if let Some(pid) = *guard {
        kill_pid(pid);
        *guard = None;
    }
    Ok(())
}

/// Rename (move) a vibe file. Creates parent directories for the new path if needed.
#[tauri::command]
pub async fn rename_vibe_file(
    root: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let old_abs = PathBuf::from(&root).join(&old_path);
    let new_abs = PathBuf::from(&root).join(&new_path);
    if let Some(parent) = new_abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&old_abs, &new_abs).map_err(|e| e.to_string())
}

/// Persist chat sessions for a project to .vibe/chats.json.
#[tauri::command]
pub async fn save_chats(root: String, sessions_json: String) -> Result<(), String> {
    let vibe_dir = PathBuf::from(&root).join(".vibe");
    fs::create_dir_all(&vibe_dir).map_err(|e| e.to_string())?;
    fs::write(vibe_dir.join("chats.json"), &sessions_json).map_err(|e| e.to_string())
}

/// Load persisted chat sessions for a project. Returns "[]" if none saved yet.
#[tauri::command]
pub async fn load_chats(root: String) -> Result<String, String> {
    let path = PathBuf::from(&root).join(".vibe").join("chats.json");
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
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

/// Project type inferred from what's on disk so we run the right thing (Python vs Node/Vite).
#[derive(Clone, Copy, PartialEq, Eq)]
enum ProjectType {
    Python,
    Node,
}

fn detect_project_type(root: &std::path::Path) -> ProjectType {
    if root.join("pyproject.toml").exists() {
        return ProjectType::Python;
    }
    if root.join("main.py").exists() || root.join("src/main.py").exists() {
        return ProjectType::Python;
    }
    let src = root.join("src");
    let has_py = src.exists()
        && fs::read_dir(&src).map_or(false, |d| {
            d.filter_map(|e| e.ok())
                .any(|e| e.path().extension().map_or(false, |x| x == "py"))
        });
    let has_ts_entry = root.join("src/main.ts").exists() || root.join("src/index.ts").exists();
    if has_py && !has_ts_entry {
        return ProjectType::Python;
    }
    if root.join("package.json").exists() && has_ts_entry {
        return ProjectType::Node;
    }
    if root.join("package.json").exists() && root.join("index.html").exists() {
        return ProjectType::Node;
    }
    if has_py {
        return ProjectType::Python;
    }
    ProjectType::Node
}

/// Find a runnable Python entry point (main.py, src/main.py, or first .py in src/).
fn find_python_entry(root: &std::path::Path) -> Option<std::path::PathBuf> {
    for name in ["main.py", "app.py"] {
        let p = root.join(name);
        if p.exists() {
            return Some(p);
        }
        let p = root.join("src").join(name);
        if p.exists() {
            return Some(p);
        }
    }
    let src = root.join("src");
    if !src.exists() {
        return None;
    }
    let mut entries: Vec<_> = fs::read_dir(&src).ok()?.filter_map(|e| e.ok()).collect();
    entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    for e in entries {
        let p = e.path();
        if p.extension().map_or(false, |x| x == "py") {
            return Some(p);
        }
    }
    None
}

/// Read .vibe/project.json if it exists, returning (dev_command, install_command).
fn read_project_manifest(root: &std::path::Path) -> Option<(String, Option<String>)> {
    let manifest_path = root.join(".vibe").join("project.json");
    let text = fs::read_to_string(&manifest_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let dev = v.get("dev")?.as_str()?.to_string();
    let install = v.get("install").and_then(|s| s.as_str()).map(|s| s.to_string());
    Some((dev, install))
}

/// Ensure project can run: check .vibe/project.json first, then fall back to heuristic detection.
/// Only one run at a time: kills previous process. Streams stdout/stderr via "run-output"; emits "run-ended" when process exits.
#[tauri::command]
pub async fn run_project(app: AppHandle, root: String, run_state: State<'_, RunState>) -> Result<String, String> {
    let root_path = PathBuf::from(&root);

    // Prefer manifest-declared dev command over heuristic detection.
    if let Some((dev_cmd, install_cmd)) = read_project_manifest(&root_path) {
        // Run install if needed (e.g. node_modules missing) and install command is specified.
        if let Some(install) = install_cmd {
            let node_modules = root_path.join("node_modules");
            if !node_modules.exists() {
                let parts: Vec<&str> = install.splitn(2, ' ').collect();
                let _ = std::process::Command::new(parts[0])
                    .args(&parts[1..])
                    .current_dir(&root_path)
                    .status();
            }
        }

        let mut guard = run_state.0.lock().await;
        if let Some(pid) = *guard { kill_pid(pid); }
        *guard = None;
        drop(guard);

        let parts: Vec<&str> = dev_cmd.splitn(2, ' ').collect();
        let program = parts[0];
        let args: Vec<&str> = if parts.len() > 1 { parts[1].split_whitespace().collect() } else { vec![] };

        let mut child = tokio::process::Command::new(program)
            .args(&args)
            .current_dir(&root_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to run '{}': {}", dev_cmd, e))?;

        let pid = child.id();
        if let Some(pid) = pid { *run_state.0.lock().await = Some(pid); }

        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
        let app2 = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app2.emit("run-output", serde_json::json!({ "line": line, "stderr": false }));
            }
        });
        let app3 = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app3.emit("run-output", serde_json::json!({ "line": line, "stderr": true }));
            }
        });
        let app4 = app.clone();
        tokio::spawn(async move {
            let _ = child.wait().await;
            let _ = app4.emit("run-ended", ());
        });

        return Ok(dev_cmd);
    }

    let project_type = detect_project_type(&root_path);

    match project_type {
        ProjectType::Python => {
            let entry = find_python_entry(&root_path).ok_or_else(|| {
                "No Python entry found (main.py, src/main.py, or src/*.py). Run Vibe to generate code.".to_string()
            })?;
            let rel = entry.strip_prefix(&root_path).unwrap_or(&entry);
            let rel_str = rel.to_string_lossy().replace('\\', "/");

            let mut guard = run_state.0.lock().await;
            if let Some(pid) = *guard {
                kill_pid(pid);
            }
            *guard = None;
            drop(guard);

            let mut child = tokio::process::Command::new("python3")
                .arg(&rel_str)
                .current_dir(&root_path)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .or_else(|_| {
                    tokio::process::Command::new("python")
                        .arg(&rel_str)
                        .current_dir(&root_path)
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped())
                        .spawn()
                })
                .map_err(|e| format!("Failed to run Python (tried python3 and python): {}", e))?;

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

            Ok(format!("Running Python: {}. Output below.", rel_str))
        }
        ProjectType::Node => {
            let pkg_path = root_path.join("package.json");
            if !pkg_path.exists() {
                scaffold_vite_app(&root_path)?;
            } else {
                ensure_vite_dev_server(&root_path)?;
            }
            ensure_npm_install(&root_path).await?;

            let mut guard = run_state.0.lock().await;
            if let Some(pid) = *guard {
                kill_pid(pid);
            }
            *guard = None;
            drop(guard);

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

            Ok("Running dev server. Output below. Open http://localhost:5173 in your browser.".to_string())
        }
    }
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

/// Merge a feature branch into the local main branch using git.
/// Checks out main, runs `git merge --no-ff <branch>`, then restores the original branch.
#[tauri::command]
pub async fn merge_branch_locally(root: String, branch: String) -> Result<String, String> {
    let root_path = PathBuf::from(&root);

    // Validate repo and branch exist before touching anything
    let repo = git2::Repository::open(&root_path).map_err(|e| e.to_string())?;
    repo.find_branch(&branch, git2::BranchType::Local)
        .map_err(|_| format!("Branch '{}' not found locally.", branch))?;
    let original_branch = repo.head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from))
        .unwrap_or_else(|| "main".to_string());
    drop(repo);

    // Use system git for the merge — git2's merge API has many edge cases.
    let run = |args: &[&str]| -> Result<String, String> {
        let out = std::process::Command::new("git")
            .args(args)
            .current_dir(&root_path)
            .output()
            .map_err(|e| format!("Failed to run git: {}", e))?;
        if out.status.success() {
            Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
        }
    };

    run(&["checkout", "main"])?;
    let merge_result = run(&[
        "merge", "--no-ff", &branch,
        "-m", &format!("Merge vibe branch: {}", branch),
    ]);
    // Always restore original branch even on failure
    let _ = run(&["checkout", &original_branch]);

    merge_result.map(|_| format!("Merged '{}' into main. Checkout main to inspect.", branch))
}

/// Read .vibe/remote.json and return its fields. Returns empty strings if the file doesn't exist.
#[tauri::command]
pub async fn read_remote_config(root: String) -> Result<serde_json::Value, String> {
    let path = PathBuf::from(&root).join(".vibe").join("remote.json");
    if !path.exists() {
        return Ok(serde_json::json!({ "owner": "", "repo": "", "webUrl": "http://localhost:3000" }));
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "owner": v.get("owner").and_then(|x| x.as_str()).unwrap_or(""),
        "repo": v.get("repo").and_then(|x| x.as_str()).unwrap_or(""),
        "webUrl": v.get("webUrl").and_then(|x| x.as_str()).unwrap_or("http://localhost:3000"),
    }))
}

/// Write .vibe/remote.json so Push knows where to send the branch (owner, repo, web app URL).
#[tauri::command]
pub async fn write_remote_config(root: String, owner: String, repo: String, web_url: String) -> Result<(), String> {
    let root_path = PathBuf::from(&root);
    let vibe_dir = root_path.join(".vibe");
    fs::create_dir_all(&vibe_dir).map_err(|e| e.to_string())?;
    let url = if web_url.trim().is_empty() {
        "http://localhost:3000"
    } else {
        web_url.trim()
    };
    let remote = serde_json::json!({ "owner": owner, "repo": repo, "webUrl": url });
    let remote_path = vibe_dir.join("remote.json");
    fs::write(
        remote_path,
        serde_json::to_string_pretty(&remote).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns contents of all .md files in .vibe/features/ on the base branch (main or master).
/// Returns empty map on any error (e.g. no base branch yet).
fn get_base_feature_contents(repo: &git2::Repository) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let base_commit = ["main", "master"]
        .iter()
        .find_map(|name| {
            repo.find_branch(name, git2::BranchType::Local)
                .ok()
                .and_then(|b| b.get().peel_to_commit().ok())
        });
    let commit = match base_commit {
        Some(c) => c,
        None => return map,
    };
    let tree = match commit.tree() {
        Ok(t) => t,
        Err(_) => return map,
    };
    let features_entry = match tree.get_path(std::path::Path::new(".vibe/features")) {
        Ok(e) => e,
        Err(_) => return map,
    };
    if features_entry.kind() != Some(git2::ObjectType::Tree) {
        return map;
    }
    let features_tree = match repo.find_tree(features_entry.id()) {
        Ok(t) => t,
        Err(_) => return map,
    };
    for entry in features_tree.iter() {
        if let Some(name) = entry.name() {
            if name.ends_with(".md") {
                if let Ok(blob) = repo.find_blob(entry.id()) {
                    if let Ok(content) = std::str::from_utf8(blob.content()) {
                        map.insert(name.to_string(), content.to_string());
                    }
                }
            }
        }
    }
    map
}

/// Push current branch state to the backend so it appears as a PR in the web app.
/// Requires .vibe/remote.json with owner, repo, webUrl (use Configure remote in Push flow if missing).
/// `implementation_proofs` is optional generated code from the Vibe compile step (code peek files).
#[tauri::command]
pub async fn push_branch_to_backend(
    root: String,
    implementation_proofs: Option<Vec<CodeFile>>,
) -> Result<PushResult, String> {
    let root_path = PathBuf::from(&root);
    let remote_path = root_path.join(".vibe").join("remote.json");
    let raw = fs::read_to_string(&remote_path)
        .map_err(|_| "NO_REMOTE: No .vibe/remote.json. Configure owner, repo and web URL to push.")?;
    let remote: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let owner = remote.get("owner").and_then(|v| v.as_str()).ok_or("remote.json must have \"owner\"")?;
    let repo = remote.get("repo").and_then(|v| v.as_str()).ok_or("remote.json must have \"repo\"")?;
    let web_url = remote.get("webUrl").and_then(|v| v.as_str()).unwrap_or("http://localhost:3000");
    let base = web_url.trim_end_matches('/');

    let repo_result = git2::Repository::open(&root_path);
    let branch = repo_result
        .as_ref()
        .ok()
        .and_then(|r| r.head().ok().and_then(|h| h.shorthand().map(String::from)))
        .unwrap_or_else(|| "main".to_string());

    let features_dir = root_path.join(".vibe").join("features");
    let mut all_features: Vec<(String, String)> = Vec::new();
    if features_dir.exists() {
        for entry in fs::read_dir(&features_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let rel = p
                .strip_prefix(&root_path)
                .map(|x| x.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| p.to_string_lossy().to_string());
            let content = fs::read_to_string(&p).unwrap_or_default();
            all_features.push((rel, content));
        }
    }

    // Compute the intent diff: only include features that are new or changed vs the base branch.
    // If on main/master or base can't be resolved, fall back to all features.
    let is_main = branch == "main" || branch == "master";
    let base_features = if is_main {
        HashMap::new()
    } else {
        repo_result
            .as_ref()
            .map(|r| get_base_feature_contents(r))
            .unwrap_or_default()
    };

    let diff_features: Vec<&(String, String)> = if is_main || base_features.is_empty() {
        all_features.iter().collect()
    } else {
        all_features.iter().filter(|(path, content)| {
            let filename = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            base_features.get(&filename).map_or(true, |base_content| base_content != content)
        }).collect()
    };

    let proofs = implementation_proofs.unwrap_or_default();
    // Convert base_features HashMap<filename, content> → [{path, content}] using canonical paths
    let base_features_vec: Vec<serde_json::Value> = base_features.iter()
        .map(|(name, content)| serde_json::json!({
            "path": format!(".vibe/features/{}", name),
            "content": content
        }))
        .collect();
    let body = serde_json::json!({
        "title": format!("Branch: {}", branch),
        "headBranch": branch,
        "author": "Vibe Studio",
        "features": diff_features.iter().map(|(path, content)| serde_json::json!({ "path": path, "content": content })).collect::<Vec<_>>(),
        "baseFeatures": base_features_vec,
        "decisionsChanged": diff_features.len(),
        "implementationProofs": proofs.iter().map(|f| serde_json::json!({ "path": f.path, "content": f.content })).collect::<Vec<_>>()
    });

    let url = format!("{}/api/projects/{}/{}/prs", base, owner, repo);
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let err: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::json!({ "error": text }));
        let msg = err.get("error").and_then(|v| v.as_str()).unwrap_or(&text);
        return Err(format!("{}: {}", status, msg));
    }
    let pr: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let pr_id = pr.get("id").and_then(|v| v.as_str()).ok_or("API did not return pr id")?;
    let pr_url = format!("{}/{}/{}/pulls/{}", base, owner, repo, pr_id);
    Ok(PushResult { pr_id: pr_id.to_string(), url: pr_url })
}

/// Pull the current main-branch vibe files from the web backend.
/// Overwrites local .vibe/features/ with the merged state, then commits to git.
/// Returns the refreshed list of local feature files.
#[tauri::command]
pub async fn pull_from_remote(root: String) -> Result<Vec<VibeFileEntry>, String> {
    let root_path = PathBuf::from(&root);
    let remote_path = root_path.join(".vibe").join("remote.json");
    let raw = fs::read_to_string(&remote_path)
        .map_err(|_| "NO_REMOTE: No .vibe/remote.json. Run Push first to configure the remote.")?;
    let remote: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let owner = remote.get("owner").and_then(|v| v.as_str()).ok_or("remote.json must have \"owner\"")?;
    let repo = remote.get("repo").and_then(|v| v.as_str()).ok_or("remote.json must have \"repo\"")?;
    let web_url = remote.get("webUrl").and_then(|v| v.as_str()).unwrap_or("http://localhost:3000");
    let base = web_url.trim_end_matches('/');

    // Fetch merged feature files from the web backend
    let url = format!("{}/api/projects/{}/{}/features", base, owner, repo);
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let err: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::json!({ "error": text }));
        let msg = err.get("error").and_then(|v| v.as_str()).unwrap_or(&text);
        return Err(format!("{}: {}", status, msg));
    }

    let files: Vec<serde_json::Value> = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if files.is_empty() {
        return Err("No vibe files found on the remote for this project. Merge a PR first.".to_string());
    }

    // Write each feature file to disk
    let features_dir = root_path.join(".vibe").join("features");
    fs::create_dir_all(&features_dir).map_err(|e| e.to_string())?;

    let mut written: Vec<VibeFileEntry> = Vec::new();
    for file in &files {
        let path = file.get("path").and_then(|v| v.as_str()).unwrap_or_default();
        let content = file.get("content").and_then(|v| v.as_str()).unwrap_or_default();
        if path.is_empty() { continue; }
        let abs = root_path.join(path);
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&abs, content).map_err(|e| e.to_string())?;
        let name = std::path::Path::new(path)
            .file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        written.push(VibeFileEntry { name, path: path.to_string(), content: content.to_string() });
    }

    // Commit the pulled changes to git (best-effort — don't fail if git isn't set up)
    let _ = std::process::Command::new("git")
        .args(["add", ".vibe/features/"])
        .current_dir(&root_path)
        .output();
    let _ = std::process::Command::new("git")
        .args(["commit", "-m", &format!("chore: pull merged vibes from {}/{} main", owner, repo)])
        .current_dir(&root_path)
        .output();

    Ok(written)
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

/// True if path has a TypeScript/JavaScript extension.
fn path_is_ts_js(path: &str) -> bool {
    path.ends_with(".ts") || path.ends_with(".tsx") || path.ends_with(".js")
}

/// True if path has a non-TS extension we treat as "other language" (py, go, rs).
fn path_is_other_lang(path: &str) -> bool {
    path.ends_with(".py") || path.ends_with(".go") || path.ends_with(".rs")
}

/// True if content looks like Python (so we can fix wrong .ts paths when spec asked for Python).
fn content_looks_python(content: &str) -> bool {
    let trim = content.trim();
    trim.starts_with("import ") || trim.starts_with("from ")
        || trim.starts_with("def ") || trim.starts_with("class ")
        || (trim.starts_with("#") && (trim.contains("python") || trim.contains("Python")))
}

/// If the model returned a .ts/.tsx path but content is Python and we asked for py, rewrite path to .py.
fn normalize_output_path(rel_path: &str, content: &str, preferred_ext: &str) -> String {
    if preferred_ext != "py" {
        return rel_path.to_string();
    }
    if !path_is_ts_js(rel_path) {
        return rel_path.to_string();
    }
    if !content_looks_python(content) {
        return rel_path.to_string();
    }
    let stem = rel_path
        .trim_end_matches(".ts")
        .trim_end_matches(".tsx")
        .trim_end_matches(".js");
    format!("{}.py", stem)
}

/// If the spec describes an interactive/UI app (calculator, user input, buttons), return instructions so the model doesn't generate auto-running demos or print state to stdout.
fn interactive_app_instruction(content: &str) -> &'static str {
    let lower = content.to_lowercase();
    let is_interactive = lower.contains("interactive")
        || lower.contains("calculator")
        || lower.contains("user input")
        || lower.contains("user interface")
        || (lower.contains("button") && (lower.contains("press") || lower.contains("click")))
        || (lower.contains("display") && lower.contains("update"));
    if is_interactive {
        "CRITICAL: The spec asks for an INTERACTIVE app (user-driven). The app must wait for user input (clicks, keypresses, etc.) and must NOT auto-run a sequence of operations or simulate button presses. Do NOT print calculator state or results to stdout/terminal — use the UI (window, DOM, GUI) for all display. The program should start, show the UI, and then block on user events only."
    } else {
        ""
    }
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

    // Build slug→content map for resolving Uses: dependencies.
    let feature_map: HashMap<String, String> = features.iter()
        .map(|(name, content)| (name.clone(), content.clone()))
        .collect();

    // Collect all Never constraints across all features.
    let all_never: Vec<String> = features.iter().flat_map(|(_, content)| {
        extract_frontmatter(content)
            .map(|fm| parse_fm_block_list(fm, "Never"))
            .unwrap_or_default()
    }).collect();
    let never_block: String = if all_never.is_empty() {
        String::new()
    } else {
        format!(
            "\n\nHARD CONSTRAINTS — never violate these regardless of what the specs say:\n{}",
            all_never.iter().map(|c| format!("- {}", c)).collect::<Vec<_>>().join("\n")
        )
    };

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

        // Language switch: when spec language and existing files don't match, treat as new file and cull obsolete files so output matches vibes.
        let paths_to_cull: Vec<String> = if ext != "ts" && ext != "tsx" && ext != "js"
            && existing.iter().all(|(p, _)| path_is_ts_js(p))
        {
            existing.iter().map(|(p, _)| p.clone()).collect()
        } else if (ext == "ts" || ext == "tsx" || ext == "js")
            && existing.iter().all(|(p, _)| path_is_other_lang(p))
        {
            existing.iter().map(|(p, _)| p.clone()).collect()
        } else {
            Vec::new()
        };
        let existing: Vec<(String, String)> = if paths_to_cull.is_empty() {
            existing
        } else {
            Vec::new()
        };

        let interactive_instruction = interactive_app_instruction(content);
        let interactive_block: String = if interactive_instruction.is_empty() {
            String::new()
        } else {
            format!("{}\n\n", interactive_instruction)
        };

        // Build dependency context from Uses: grammar field.
        let dep_block: String = extract_frontmatter(content)
            .map(|fm| {
                let uses = parse_fm_inline_list(fm, "Uses");
                uses.iter().flat_map(|grammar_name| {
                    let slug = grammar_name_to_slug(grammar_name);
                    feature_map.get(&slug).map(|dep_content| {
                        format!("### dependency: {}\n```markdown\n{}\n```\n\n", grammar_name, dep_content)
                    })
                }).collect::<String>()
            })
            .unwrap_or_default();

        let prompt = if existing.is_empty() {
            let base_dir = globs[0].trim_end_matches('/').trim_end_matches("/**");
            let base_dir = if base_dir.is_empty() { "src" } else { base_dir };
            format!(
                r#"You are a senior software engineer. Create NEW code that implements this specification.
There is no existing code yet — generate one or more files that work together (imports, entry points, etc.).
{}.
{}{}Do NOT derive file names from the vibe document name (e.g. "overview.md"). Name files by the feature's purpose and use conventional, best-practice naming for the language and project (e.g. calculator.py, components/Calculator.tsx, or domain-based structure). Place all files under {}/.

## Vibe Specification
```markdown
{}
```
{}
Respond with ONLY a valid JSON array of one or more objects:
[{{"filePath":"<path under {}>","content":"<full file content>"}}, ...]
Use forward slashes in paths. All files must work together. No markdown fences."#,
                lang_instruction,
                interactive_block,
                dep_block,
                base_dir,
                content,
                never_block,
                base_dir
            )
        } else {
            let files_block: String = existing
                .iter()
                .map(|(path, c)| format!("### {}\n```\n{}\n```\n\n", path, c))
                .collect();
            format!(
                r#"You are a senior software engineer. Update the existing code to implement this specification.
{}.
{}{}You may modify one or more of the existing files and/or add new files under the same directory structure. All output files must work together (correct imports, exports, entry points). Use conventional file names for any new files (feature/domain-based, not the vibe document name).

## Vibe Specification
```markdown
{}
```
{}
## Existing Code
{}

Respond with ONLY a valid JSON array of objects for every file you change or add:
[{{"filePath":"<exact path>","content":"<full file content>"}}, ...]
Return [] if no changes needed. No markdown fences."#,
                lang_instruction,
                interactive_block,
                dep_block,
                content,
                never_block,
                files_block
            )
        };

        match call_gemini(&client, &api_key, &prompt).await {
            Ok(text) => {
                match parse_codegen_response(&text) {
                    Ok(files) => {
                        for (rel_path, file_content) in files {
                            let rel_path = normalize_output_path(&rel_path, &file_content, ext);
                            let abs = root_path.join(&rel_path);
                            if let Some(parent) = abs.parent() {
                                let _ = fs::create_dir_all(parent);
                            }
                            if fs::write(&abs, &file_content).is_ok() {
                                generated += 1;
                            }
                        }
                        // Cull obsolete files so output matches vibes (e.g. remove .ts when we switched to .py).
                        for path in &paths_to_cull {
                            let _ = fs::remove_file(root_path.join(path));
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

    // Extract grammar from the current vibe content for richer context.
    let grammar_summary = if let Some(fm) = extract_frontmatter(&vibe_context) {
        let uses = parse_fm_inline_list(fm, "Uses");
        let data = parse_fm_inline_list(fm, "Data");
        let never = parse_fm_block_list(fm, "Never");
        let mut parts = Vec::new();
        if !uses.is_empty() { parts.push(format!("Uses: {}", uses.join(", "))); }
        if !data.is_empty() { parts.push(format!("Data: {}", data.join(", "))); }
        if !never.is_empty() { parts.push(format!("Never: {}", never.join("; "))); }
        if parts.is_empty() { String::new() } else {
            format!("\n\nGrammar declared in this feature:\n{}", parts.join("\n"))
        }
    } else {
        String::new()
    };

    let system_context = format!(
        "You are an expert software architect and product manager working inside Vibe Studio. \
         You help users edit their 'Vibe' files — human-readable feature specifications that drive code generation.\n\n\
         Vibe files use structured grammar frontmatter with three fields:\n\
         - Uses: [FeatureName, ...] — other features this one depends on (PascalCase names)\n\
         - Data: [EntityName, ...] — data entities this feature touches (PascalCase names)\n\
         - Never: constraints the compiler must never violate\n\n\
         Current project root: {root}\n\
         Current feature: {feature_name}{grammar_summary}\n\n\
         Current Vibe file content:\n```markdown\n{vibe_context}\n```\n\n\
         When suggesting changes, preserve and update the grammar frontmatter. \
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

/// Apply the assistant's suggested edits to the vibe markdown file. Calls the model to produce the full updated file content, writes it to disk, and returns the new content.
#[tauri::command]
pub async fn apply_chat_to_vibe_file(
    root: String,
    feature_name: String,
    current_content: String,
    last_assistant_message: String,
) -> Result<String, String> {
    let api_key = std::env::var("GEMINI_API_KEY")
        .map_err(|_| "GEMINI_API_KEY not set. Set it in .env and run with `make desktop`.")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={api_key}"
    );

    let prompt = format!(
        r#"You are applying suggested edits to a Vibe (feature specification) markdown file. The user asked for changes in chat and the assistant replied with a suggestion. Your task is to output the COMPLETE updated file content that applies that suggestion.

Vibe files use structured grammar frontmatter with three PascalCase fields:
- Uses: [FeatureName, ...] — dependencies on other features
- Data: [EntityName, ...] — data entities this feature touches
- Never: constraints the compiler must never violate

Rules:
1. If the current file has grammar frontmatter (---...---), preserve it and update it to reflect any new dependencies, entities, or constraints implied by the changes.
2. If the current file has no grammar frontmatter, add it at the top with appropriate values inferred from the content.
3. All names in Uses and Data must be PascalCase (e.g. UserAuthentication, PaymentMethod).

Current file content:
```markdown
{}
```

Assistant's suggestion (what the user should change):
```
{}
```

Output ONLY the complete updated markdown file content. No code fences, no "Here is the updated content", no explanation. Just the raw markdown that should be written to the file."#,
        current_content,
        last_assistant_message
    );

    let body = serde_json::json!({
        "contents": [{ "role": "user", "parts": [{ "text": prompt }] }]
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(err_obj) = json.get("error") {
        let msg = err_obj
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown API error");
        return Err(format!("Gemini API error: {}", msg));
    }

    let text = json
        .get("candidates")
        .and_then(|c| c.as_array())
        .and_then(|c| c.first())
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.as_array())
        .and_then(|p| p.first())
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| "No text in model response".to_string())?
        .to_string();

    // Strip markdown code fences if the model wrapped the output
    let content = text
        .trim()
        .trim_start_matches("```markdown")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();

    let rel_path = format!(".vibe/features/{}.md", feature_name);
    let abs = PathBuf::from(&root).join(&rel_path);
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs, &content).map_err(|e| e.to_string())?;

    Ok(content)
}
