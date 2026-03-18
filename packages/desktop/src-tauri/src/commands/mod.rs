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
    if dev_deps.get("vitest").is_none() {
        dev_deps["vitest"] = serde_json::json!("^2.0.0");
    }
    // Add test script if missing
    if pkg.get("scripts").is_none() {
        pkg["scripts"] = serde_json::json!({});
    }
    if pkg["scripts"].get("test").is_none() {
        pkg["scripts"]["test"] = serde_json::json!("vitest");
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
    if !root.join("tsconfig.json").exists() {
        let tsconfig = serde_json::json!({
            "compilerOptions": {
                "target": "ES2020", "module": "ESNext", "moduleResolution": "bundler",
                "strict": true, "noImplicitAny": true, "strictNullChecks": true,
                "esModuleInterop": true, "skipLibCheck": true, "lib": ["ES2020", "DOM"]
            },
            "include": ["src/**/*", "vite.config.ts"]
        });
        let _ = fs::write(
            root.join("tsconfig.json"),
            serde_json::to_string_pretty(&tsconfig).unwrap_or_default(),
        );
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
        "scripts": { "dev": "vite", "build": "vite build", "test": "vitest" },
        "devDependencies": { "vite": "^6.0.0", "typescript": "^5.0.0", "vitest": "^2.0.0", "@vitest/coverage-v8": "^2.0.0" }
    });
    fs::write(
        root.join("package.json"),
        serde_json::to_string_pretty(&pkg).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let tsconfig = serde_json::json!({
        "compilerOptions": {
            "target": "ES2020",
            "module": "ESNext",
            "moduleResolution": "bundler",
            "strict": true,
            "noImplicitAny": true,
            "strictNullChecks": true,
            "esModuleInterop": true,
            "skipLibCheck": true,
            "lib": ["ES2020", "DOM"]
        },
        "include": ["src/**/*", "vite.config.ts"]
    });
    fs::write(
        root.join("tsconfig.json"),
        serde_json::to_string_pretty(&tsconfig).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    // Error overlay: shows runtime errors in the UI so non-technical users see them
    let index_html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vibe App</title>
  <script>
    window.onerror = function(msg, _src, _line, _col, err) {
      var d = document.getElementById('vibe-err') || document.createElement('div');
      d.id = 'vibe-err';
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b00;color:#fff;padding:12px 16px;font:13px/1.5 monospace;white-space:pre-wrap;max-height:50vh;overflow:auto';
      d.textContent = err ? (err.stack || err.toString()) : msg;
      if (!d.parentNode) { document.body ? document.body.prepend(d) : document.addEventListener('DOMContentLoaded', function(){ document.body.prepend(d); }); }
    };
    window.addEventListener('unhandledrejection', function(e) {
      var r = e.reason; window.onerror(r && r.message ? r.message : String(r), '', 0, 0, r instanceof Error ? r : null);
    });
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
"#;
    fs::write(root.join("index.html"), index_html).map_err(|e| e.to_string())?;

    let main_ts = r#"// Entry point for your Vibe app. Edit src/ or run Vibe compile to generate.
const rootEl = document.getElementById('root');
if (rootEl) {
  rootEl.innerHTML = '<h1>Vibe App</h1><p>Run <strong>Vibe</strong> in Vibe Studio to generate your app, or edit <code>src/</code>.</p>';
}
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
        return Ok(serde_json::json!({ "owner": "", "repo": "", "webUrl": "https://getvibehub.com" }));
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "owner": v.get("owner").and_then(|x| x.as_str()).unwrap_or(""),
        "repo": v.get("repo").and_then(|x| x.as_str()).unwrap_or(""),
        "webUrl": v.get("webUrl").and_then(|x| x.as_str()).unwrap_or("https://getvibehub.com"),
    }))
}

/// Write .vibe/remote.json so Push knows where to send the branch (owner, repo, web app URL).
#[tauri::command]
pub async fn write_remote_config(root: String, owner: String, repo: String, web_url: String) -> Result<(), String> {
    let root_path = PathBuf::from(&root);
    let vibe_dir = root_path.join(".vibe");
    fs::create_dir_all(&vibe_dir).map_err(|e| e.to_string())?;
    let url = if web_url.trim().is_empty() {
        "https://getvibehub.com"
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
    let web_url = remote.get("webUrl").and_then(|v| v.as_str()).unwrap_or("https://getvibehub.com");
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
    let web_url = remote.get("webUrl").and_then(|v| v.as_str()).unwrap_or("https://getvibehub.com");
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

/// Default codegen model. Can be overridden via VIBE_MODEL env var.
fn codegen_model() -> String {
    std::env::var("VIBE_MODEL").unwrap_or_else(|_| "gemini-2.5-flash-lite".to_string())
}
const MAX_FILE_CHARS: usize = 8_000;

/// Shared grammar reference injected into every AI prompt.
/// Defines the vibe frontmatter format, naming conventions, and the starter template
/// so all models have the same understanding of the spec format regardless of context.
const GRAMMAR_CONTEXT: &str = "\
## Vibe Grammar Reference

Every vibe file starts with a YAML frontmatter block between `---` delimiters:

```
---
Uses: [FeatureName, OtherFeature]   # PascalCase — other features this one depends on
Data: [EntityName, OtherEntity]     # PascalCase — data entities this feature reads or writes
Never:                              # Hard constraints the compiler must never violate
  - do not store passwords in plain text
  - never expose internal user IDs to the client
Connects: [GoogleSheets, Stripe]    # PascalCase — external service integrations this feature uses
Variables: [API_KEY, SECRET_TOKEN]  # Environment/config variables this feature needs at runtime
---

# Feature Title

## What it does
Plain-language description.

## Behavior
- Specific rules, edge cases, conditions
- Each bullet is something the compiler should implement

## Acceptance criteria
- How do you know this feature is working correctly?
```

Naming rules:
- All values in `Uses` and `Data` must be PascalCase (e.g. UserAuthentication, PaymentMethod, GoogleSheets)
- Feature file names are kebab-case (user-auth.md) but referenced in grammar as PascalCase (UserAuth)
- `Uses` declares compile-time dependencies — the compiler will inject the content of those features as context
- `Data` declares data shape ownership — used to detect cross-feature data coupling
- `Never` entries are hard constraints forwarded verbatim to the compiler as prohibited behaviours
- `Connects` declares external service integrations — each name must match a .vibe/integrations/{Name}.md file
- `Variables` declares runtime config variables — names should be SCREAMING_SNAKE_CASE. These are values the user must provide when setting up the tool (API keys, config values, etc.)";

/// Defensive coding rules injected into every codegen prompt.
/// Prevents the most common class of runtime crashes in generated code.
const DEFENSIVE_CODING_RULES: &str = "\
Defensive coding requirements (MANDATORY — prevents runtime crashes):
- Null-check every DOM query before use. If a required container is missing, CREATE it: \
  let el = document.getElementById('x'); if (!el) { el = document.createElement('div'); el.id = 'x'; document.body.appendChild(el); }
- Never silently return when a required container is missing — that hides bugs. Create the element instead.
- ALL DOM queries (getElementById, querySelector) MUST be inside DOMContentLoaded or a function called after DOMContentLoaded. \
  NEVER put getElementById calls at the top level of a module — they will get null because the DOM is not ready yet.
- Use optional chaining (?.) for any property that might be null or undefined
- Wrap async initialisation in try/catch and display errors in the UI, not just console.error
- Never call methods on a value that could be null without a prior null guard
- EVERY file you import with a relative path MUST be included in your output. \
  If you write `import './style.css'` you MUST also output a `style.css` file block. \
  If you write `import { foo } from './utils'` you MUST also output a `utils.ts` file block that exports `foo`. \
  Never import a file you are not generating — it will crash the build at load time.
- index.html MUST include `<script type=\"module\" src=\"/src/main.ts\"></script>` before </body>. \
  Without this script tag the app will render as a blank page. This is the #1 most common bug.
- Never use placeholder/stub implementations like console.log('TODO') for core features. \
  Every function described in the spec MUST have a working implementation with visible UI output.
- For charts/plots, use inline Canvas 2D or SVG rendering. Do NOT import external charting libraries \
  unless they are already in package.json. Draw directly on a <canvas> element.
- DATA PERSISTENCE: All user data MUST be persisted to localStorage using stable, predictable keys. \
  Use the pattern `vibe:{EntityName}` where EntityName matches the Data: grammar field (e.g. `vibe:BankAccount`). \
  On app init, ALWAYS load existing data from localStorage before rendering. On every mutation, save back. \
  This ensures user data survives recompilation. Never use random or timestamp-based keys. \
  Example: `const items = JSON.parse(localStorage.getItem('vibe:BankAccount') || '[]');` on init, \
  and `localStorage.setItem('vibe:BankAccount', JSON.stringify(items));` after every change.";

async fn call_gemini(client: &reqwest::Client, api_key: &str, prompt: &str) -> Result<String, String> {
    let model = codegen_model();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
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

/// Parse the delimiter-based codegen response format:
///   ===FILE:src/main.ts===
///   <content>
///   ===ENDFILE===
///
/// Falls back to the legacy JSON array format so old responses still work.
fn parse_codegen_response(text: &str) -> Result<Vec<(String, String)>, String> {
    // ── Primary: delimiter format ──────────────────────────────────────────
    const FILE_START: &str = "===FILE:";
    const FILE_END: &str = "===ENDFILE===";

    if text.contains(FILE_START) {
        let mut files = Vec::new();
        let mut remaining = text;
        while let Some(start) = remaining.find(FILE_START) {
            remaining = &remaining[start + FILE_START.len()..];
            // everything up to the next === is the path
            let eq_pos = remaining.find("===").ok_or("Malformed FILE block: missing closing ===")?;
            let path = remaining[..eq_pos].trim().to_string();
            remaining = &remaining[eq_pos + 3..]; // skip ===
            // content runs until ===ENDFILE=== (or end of string)
            let content = if let Some(end) = remaining.find(FILE_END) {
                let c = remaining[..end].trim_start_matches('\n').to_string();
                remaining = &remaining[end + FILE_END.len()..];
                c
            } else {
                let c = remaining.trim_start_matches('\n').to_string();
                remaining = "";
                c
            };
            if !path.is_empty() && !content.is_empty() {
                files.push((path, content));
            }
        }
        if !files.is_empty() {
            return Ok(files);
        }
        // If we found FILE_START markers but extracted nothing, fall through to JSON
    }

    // ── Fallback: JSON array [{filePath, content}] ─────────────────────────
    let text = text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    if text == "[]" || text.is_empty() {
        return Ok(vec![]);
    }
    let arr: Vec<serde_json::Value> = serde_json::from_str(text).map_err(|e| {
        // Surface a more helpful error: include the first 200 chars so the caller can log it
        format!("JSON parse failed ({}); first 200 chars: {:?}", e, &text[..text.len().min(200)])
    })?;
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

/// Phase 1 of compilation: generate (or regenerate) the app shell — index.html and the entry
/// point — with awareness of ALL vibe features so the DOM structure is consistent before any
/// per-feature code is written.
///
/// Only regenerates if any of the shell files are missing OR if they still contain the default
/// scaffold stub (detected by the presence of "Run Vibe" in main.ts).
/// Returns the number of files written.
async fn generate_app_shell(
    client: &reqwest::Client,
    api_key: &str,
    root_path: &std::path::Path,
    features: &[(String, String)],
    all_never: &[String],
    force: bool,
) -> usize {
    // Skip if the project doesn't look like a web app.
    if !root_path.join("package.json").exists() {
        return 0;
    }

    // Detect if shell files exist and contain real (non-stub) content.
    let main_content = fs::read_to_string(root_path.join("src/main.ts"))
        .or_else(|_| fs::read_to_string(root_path.join("src/index.ts")))
        .unwrap_or_default();
    let html_content = fs::read_to_string(root_path.join("index.html")).unwrap_or_default();
    let is_stub = main_content.contains("Run Vibe") || main_content.trim().is_empty();
    let html_missing = html_content.trim().is_empty();
    if !force && !is_stub && !html_missing {
        return 0; // Shell is current — skip.
    }

    // Build a compact summary of every feature for the shell prompt.
    let specs: String = features
        .iter()
        .map(|(name, content)| {
            let preview: String = content.lines().take(30).collect::<Vec<_>>().join("\n");
            format!("### {}\n{}\n\n", name, preview)
        })
        .collect();

    let never_block: String = if all_never.is_empty() {
        String::new()
    } else {
        format!(
            "\nHard constraints:\n{}\n",
            all_never.iter().map(|c| format!("- {}", c)).collect::<Vec<_>>().join("\n")
        )
    };

    let prompt = format!(
        r#"You are a senior software engineer setting up the HTML shell and entry point for a web app.
The app will implement these features (full specs follow):

{specs}
{never}
Your job is to output ONLY:
1. `index.html` — a complete HTML page that declares the DOM containers ALL features will need
   (nav sections, content divs, etc. each with clear id attributes). Include the error overlay script.
2. `src/main.ts` — the entry point that initialises the app: wires up navigation, imports feature
   modules, and sets up any shared state. Use DOMContentLoaded. Null-check every getElementById.

{defensive}

Error overlay to include verbatim in index.html <head>:
<script>
window.onerror=function(m,_,_,_,e){{var d=document.getElementById('vibe-err')||document.createElement('div');d.id='vibe-err';d.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:#b00;color:#fff;padding:12px;font:13px monospace;white-space:pre-wrap;max-height:50vh;overflow:auto';d.textContent=e?e.stack||e.toString():m;if(!d.parentNode){{document.body?document.body.prepend(d):document.addEventListener('DOMContentLoaded',function(){{document.body.prepend(d);}});}}}}
window.addEventListener('unhandledrejection',function(e){{var r=e.reason;window.onerror(r&&r.message?r.message:String(r),'',0,0,r instanceof Error?r:null);}});
</script>

Output using this format only:

===FILE:index.html===
<content>
===ENDFILE===

===FILE:src/main.ts===
<content>
===ENDFILE===
"#,
        specs = specs,
        never = never_block,
        defensive = DEFENSIVE_CODING_RULES,
    );

    let text = match call_gemini(client, api_key, &prompt).await {
        Ok(t) => t,
        Err(_) => return 0,
    };
    let files = match parse_codegen_response(&text) {
        Ok(f) => f,
        Err(_) => return 0,
    };
    let mut written = 0usize;
    for (rel_path, content) in files {
        let abs = root_path.join(&rel_path);
        if let Some(parent) = abs.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::write(&abs, &content).is_ok() {
            written += 1;
        }
    }

    // ── Post-generation repair: ensure index.html loads main.ts ──────────────
    // The model sometimes forgets the <script> tag, which makes the page blank.
    repair_html_script_tag(root_path);

    written
}

/// Ensure index.html contains a <script type="module"> tag that loads the entry point.
/// Without this, the generated app renders as a blank page.
fn repair_html_script_tag(root: &std::path::Path) {
    let html_path = root.join("index.html");
    let Ok(mut html) = fs::read_to_string(&html_path) else { return };

    // Detect which entry point exists
    let entry = if root.join("src/main.ts").exists() {
        "/src/main.ts"
    } else if root.join("src/index.ts").exists() {
        "/src/index.ts"
    } else {
        return; // No entry point to link
    };

    // Check if there's already a script tag pointing to the entry
    if html.contains(entry) {
        return; // Already present
    }

    // Insert before </body>
    let script_tag = format!(r#"    <script type="module" src="{}"></script>"#, entry);
    if let Some(pos) = html.rfind("</body>") {
        html.insert_str(pos, &format!("{}\n", script_tag));
    } else {
        // No </body> tag — append at end
        html.push_str(&format!("\n{}\n", script_tag));
    }
    let _ = fs::write(&html_path, html);
}

// ─── Architecture manifest helpers ───────────────────────────────────────────

/// FNV-1a 64-bit hash for cheap spec-change detection (no extra deps needed).
fn spec_hash(s: &str) -> u64 {
    let mut h: u64 = 14695981039346656037;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1099511628211);
    }
    h
}

/// Extract all `id="..."` values from HTML content (deduped, order-preserved).
fn extract_dom_ids(html: &str) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    let mut rest = html;
    while let Some(pos) = rest.find("id=\"") {
        rest = &rest[pos + 4..];
        if let Some(end) = rest.find('"') {
            let id = &rest[..end];
            if !id.is_empty() && !ids.iter().any(|x| x == id) {
                ids.push(id.to_string());
            }
            rest = &rest[end + 1..];
        } else {
            break;
        }
    }
    ids
}

/// Scan src/ TypeScript files and collect exported names as "path:name" pairs.
fn extract_ts_exports(root: &std::path::Path) -> Vec<String> {
    let src = root.join("src");
    let mut exports = Vec::new();
    if !src.exists() { return exports; }
    for entry in WalkDir::new(&src).max_depth(4).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() { continue; }
        let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "ts" && ext != "tsx" { continue; }
        let path_str = entry.path().to_string_lossy();
        if path_str.contains("__tests__") || path_str.contains(".test.") { continue; }
        let Ok(content) = fs::read_to_string(entry.path()) else { continue; };
        let rel = entry.path().strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        for line in content.lines() {
            let t = line.trim();
            for kw in &["export function ", "export async function ", "export class ",
                        "export const ", "export let "] {
                if t.starts_with(kw) {
                    let after = &t[kw.len()..];
                    let end = after.find(|c: char| !c.is_alphanumeric() && c != '_')
                        .unwrap_or(after.len());
                    let name = &after[..end];
                    if !name.is_empty() {
                        exports.push(format!("{}:{}", rel, name));
                    }
                    break;
                }
            }
        }
    }
    exports
}

/// Write .vibe/arch.json with current DOM element IDs, module paths, and exported identifiers.
/// This file is included as context in future compilations so the model never invents new IDs.
fn write_arch_manifest(root: &std::path::Path) {
    let html = fs::read_to_string(root.join("index.html")).unwrap_or_default();
    let dom_ids = extract_dom_ids(&html);
    let exports = extract_ts_exports(root);
    let src = root.join("src");
    let mut modules: Vec<String> = Vec::new();
    if src.exists() {
        for entry in WalkDir::new(&src).max_depth(4).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() { continue; }
            let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext != "ts" && ext != "tsx" { continue; }
            let path_str = entry.path().to_string_lossy();
            if path_str.contains("__tests__") || path_str.contains(".test.") { continue; }
            if let Ok(rel) = entry.path().strip_prefix(root) {
                modules.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    modules.sort();
    let arch = serde_json::json!({
        "version": 1,
        "dom_elements": dom_ids,
        "modules": modules,
        "exports": exports,
    });
    let vibe_dir = root.join(".vibe");
    let _ = fs::create_dir_all(&vibe_dir);
    let _ = fs::write(vibe_dir.join("arch.json"),
        serde_json::to_string_pretty(&arch).unwrap_or_default());
}

/// Scan a source file (typically main.ts) for named imports from a given relative module path
/// and return the list of imported names. E.g. given feature_name "diary" and a line:
///   import { initializeDiary, cancelEdit } from "./features/diary/diary"
/// returns ["initializeDiary", "cancelEdit"].
fn extract_required_exports_from_main(main_content: &str, feature_name: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    let feature_slug = feature_name.replace('-', "_"); // handle both kebab and snake
    for line in main_content.lines() {
        let t = line.trim();
        if !t.starts_with("import") { continue; }
        // Must reference this feature's path (e.g. "./features/diary/", "./diary")
        let lower = t.to_lowercase();
        if !lower.contains(&format!("/{}", feature_name))
            && !lower.contains(&format!("/{}", feature_slug))
            && !lower.contains(&format!("\"{}\"", feature_name))
            && !lower.contains(&format!("'{}'", feature_name))
        {
            continue;
        }
        // Extract named imports: import { A, B, C } from "..."
        if let (Some(open), Some(close)) = (t.find('{'), t.find('}')) {
            let inner = &t[open + 1..close];
            for part in inner.split(',') {
                // Handle "name as alias" — we need the original export name
                let export_name = part.trim()
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .trim_matches(',');
                if !export_name.is_empty() && export_name != "*" {
                    names.push(export_name.to_string());
                }
            }
        }
    }
    names.sort();
    names.dedup();
    names
}

/// Extract acceptance criteria bullet points from a vibe spec (the ## Acceptance criteria section).
fn extract_acceptance_criteria(content: &str) -> Vec<String> {
    let mut in_section = false;
    let mut criteria = Vec::new();
    for line in content.lines() {
        let t = line.trim();
        if t.starts_with('#') && t.to_lowercase().contains("acceptance") {
            in_section = true;
            continue;
        }
        if in_section {
            if t.starts_with('#') { break; }
            let item = t.strip_prefix("- ").or_else(|| t.strip_prefix("* "));
            if let Some(item) = item {
                let item = item.trim();
                if !item.is_empty() { criteria.push(item.to_string()); }
            }
        }
    }
    criteria
}

/// Generate a Vitest test file for `feature_name` from its acceptance criteria.
/// Writes to src/__tests__/{name}.test.ts. Returns true if the file was written.
async fn generate_feature_tests(
    client: &reqwest::Client,
    api_key: &str,
    root_path: &std::path::Path,
    feature_name: &str,
    spec_content: &str,
    criteria: &[String],
) -> bool {
    // Collect up to 3 existing source files as context for import paths.
    let src = root_path.join("src");
    let mut src_block = String::new();
    let mut file_count = 0usize;
    if src.exists() {
        for entry in WalkDir::new(&src).max_depth(3).into_iter().filter_map(|e| e.ok()) {
            if file_count >= 3 { break; }
            if !entry.file_type().is_file() { continue; }
            let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext != "ts" && ext != "tsx" { continue; }
            let path_str = entry.path().to_string_lossy();
            if path_str.contains("__tests__") || path_str.contains(".test.") { continue; }
            if let Ok(content) = fs::read_to_string(entry.path()) {
                let rel = entry.path().strip_prefix(root_path)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_default();
                let snippet: String = content.chars().take(2500).collect();
                src_block.push_str(&format!("===FILE:{}===\n{}\n===ENDFILE===\n\n", rel, snippet));
                file_count += 1;
            }
        }
    }

    let criteria_list = criteria.iter().map(|c| format!("- {}", c)).collect::<Vec<_>>().join("\n");
    let prompt = format!(
        r#"Generate a Vitest test file for the "{name}" feature.

Write one `it(...)` block per acceptance criterion. Test ONLY the criteria listed.

Acceptance criteria:
{criteria}

Feature spec (for context):
```markdown
{spec}
```

Existing source files (for import paths):
{sources}
Rules:
- Use: import {{ describe, it, expect, beforeEach, afterEach }} from 'vitest'
- Add `// @vitest-environment jsdom` as the first line if tests manipulate the DOM
- Import exported functions/classes from their source files where possible; test units directly
- For DOM-only features with no exports, set up document.body and call the init function
- Do NOT mock internal modules — test real behaviour against real code
- Keep each test focused on a single observable outcome from the criterion
- Output exactly one file

Output format:
===FILE:src/__tests__/{name}.test.ts===
<full file content>
===ENDFILE==="#,
        name = feature_name,
        criteria = criteria_list,
        spec = spec_content,
        sources = src_block,
    );

    match call_gemini(client, api_key, &prompt).await {
        Ok(text) => match parse_codegen_response(&text) {
            Ok(files) => {
                for (path, content) in files {
                    let abs = root_path.join(&path);
                    if let Some(parent) = abs.parent() { let _ = fs::create_dir_all(parent); }
                    if fs::write(&abs, &content).is_ok() { return true; }
                }
                false
            }
            Err(_) => false,
        },
        Err(_) => false,
    }
}

// Compilation runs in two phases:
// Phase 1 (shell): one model call with all specs → generates index.html + entry so DOM structure
//   is consistent before any feature code is written.
// Phase 2 (features): per-feature model calls with the shell as shared context.
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

    // ── Phase 1: shell pass ───────────────────────────────────────────────────
    // Regenerate index.html + entry point whenever the combined spec hash changes.
    // This keeps DOM containers in sync with feature requirements and prevents
    // "element not found" runtime errors when new features are added or existing
    // ones change their layout needs.
    let shell_hash_path = vibe_dir.join("shell-hash");
    let specs_combined: String = features.iter().map(|(n, c)| format!("{}:{}", n, c)).collect();
    let new_shell_hash = spec_hash(&specs_combined);
    let stored_shell_hash: u64 = fs::read_to_string(&shell_hash_path)
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0);
    let shell_needs_regen = new_shell_hash != stored_shell_hash;

    let shell_changed = generate_app_shell(
        &client, &api_key, &root_path, &features, &all_never, shell_needs_regen,
    ).await;
    generated += shell_changed;
    // Persist the hash so we only regenerate when specs actually change.
    if shell_needs_regen {
        let _ = fs::write(&shell_hash_path, new_shell_hash.to_string());
    }

    // ── Build shared HTML/entry context for phase 2 ───────────────────────────
    // Every per-feature prompt receives the current index.html and entry so the
    // model never invents element IDs that don't exist. Also includes arch.json
    // when available so element IDs and module paths are preserved across runs.
    let shared_context: String = ["index.html", "src/main.ts", "src/index.ts"]
        .iter()
        .filter_map(|p| {
            let content = fs::read_to_string(root_path.join(p)).ok()?;
            if content.trim().is_empty() { return None; }
            Some(format!("===FILE:{}===\n{}\n===ENDFILE===\n\n", p, content))
        })
        .collect();
    // Include existing arch.json so the model reuses established DOM IDs and module paths.
    let arch_json = fs::read_to_string(vibe_dir.join("arch.json")).unwrap_or_default();
    let arch_block = if arch_json.trim().is_empty() {
        String::new()
    } else {
        format!(
            "\n## Architecture manifest (.vibe/arch.json)\n\
             Use these DOM element IDs and module paths — do NOT invent new ones unless \
             genuinely required by a new feature:\n```json\n{}\n```\n",
            arch_json
        )
    };
    let shared_context_block = if shared_context.is_empty() && arch_block.is_empty() {
        String::new()
    } else {
        format!("\n## Global project files (you may update these)\n{}{}", shared_context, arch_block)
    };

    // ── Load test manifest (tracks spec hash per feature to avoid redundant test regen) ──
    let test_manifest_path = vibe_dir.join("test-manifest.json");
    let mut test_manifest: HashMap<String, u64> = fs::read_to_string(&test_manifest_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| {
            Some(v.as_object()?.iter()
                .filter_map(|(k, v)| Some((k.clone(), v.as_u64()?)))
                .collect())
        })
        .unwrap_or_default();
    let mut test_manifest_dirty = false;

    // Read current main.ts once so we can extract per-feature import contracts below.
    let main_ts_content = fs::read_to_string(root_path.join("src/main.ts"))
        .or_else(|_| fs::read_to_string(root_path.join("src/index.ts")))
        .unwrap_or_default();

    // ── Build shared Data schema ─────────────────────────────────────────────
    // Collect all Data: entities across features and build a shared schema block
    // so every feature works with the same data structures instead of inventing its own.
    let mut all_data_entities: Vec<String> = Vec::new();
    let mut data_owners: HashMap<String, Vec<String>> = HashMap::new(); // entity → features that use it
    for (name, content) in &features {
        if let Some(fm) = extract_frontmatter(content) {
            let entities = parse_fm_inline_list(fm, "Data");
            for entity in &entities {
                if !all_data_entities.contains(entity) {
                    all_data_entities.push(entity.clone());
                }
                data_owners.entry(entity.clone()).or_default().push(name.clone());
            }
        }
    }
    // Check if a shared data module already exists; if so, include it as the canonical schema.
    let data_module_content = ["src/data.ts", "src/store.ts", "src/types.ts", "src/utils.ts"]
        .iter()
        .find_map(|p| {
            let content = fs::read_to_string(root_path.join(p)).ok()?;
            if content.contains("interface") || content.contains("type ") {
                Some((p.to_string(), content))
            } else {
                None
            }
        });
    let shared_data_block: String = if all_data_entities.is_empty() {
        String::new()
    } else {
        let entity_list = all_data_entities.iter()
            .map(|e| {
                let owners = data_owners.get(e).map(|v| v.join(", ")).unwrap_or_default();
                format!("- {} (used by: {})", e, owners)
            })
            .collect::<Vec<_>>().join("\n");
        let existing_schema = data_module_content
            .map(|(path, content)| {
                format!(
                    "\n\nExisting shared data module (`{}`) — import types from here, do NOT redefine them:\n```typescript\n{}\n```",
                    path, content
                )
            })
            .unwrap_or_else(|| {
                "\n\nNo shared data module exists yet. If you are the first feature compiled, \
                 create `src/data.ts` that exports interfaces for all entities listed above. \
                 Other features will import from it.".to_string()
            });
        format!(
            "\n## Shared Data Entities\n\
             These data types are shared across multiple features. ALL features MUST use the same \
             interfaces/types — never redefine or hallucinate data structures.\n{}\n{}\n",
            entity_list, existing_schema
        )
    };

    // ── Phase 2: per-feature codegen ──────────────────────────────────────────
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

        // Build integration context from Connects: grammar field.
        let integration_block = build_integration_context(content, &vibe_dir.join("integrations"));

        // Build dependency context from Uses: grammar field.
        let (dep_block, unresolved_uses) = extract_frontmatter(content)
            .map(|fm| {
                let uses = parse_fm_inline_list(fm, "Uses");
                let mut resolved = String::new();
                let mut unresolved: Vec<String> = Vec::new();
                for grammar_name in &uses {
                    let slug = grammar_name_to_slug(grammar_name);
                    if let Some(dep_content) = feature_map.get(&slug) {
                        resolved.push_str(&format!("### dependency: {}\n```markdown\n{}\n```\n\n", grammar_name, dep_content));
                    } else {
                        unresolved.push(grammar_name.clone());
                    }
                }
                (resolved, unresolved)
            })
            .unwrap_or_default();

        // Warn model about unresolved Uses: references so it doesn't hallucinate them.
        let unresolved_warning = if unresolved_uses.is_empty() {
            String::new()
        } else {
            format!(
                "\n## WARNING: Unresolved dependencies\n\
                 The spec references these in Uses: but they do NOT exist as features: {}\n\
                 Do NOT import, reference, or invent modules/classes/stores for these names. \
                 Use the Data: entities with localStorage instead.\n\n",
                unresolved_uses.join(", ")
            )
        };

        // Detect what main.ts already imports from this feature so we can enforce
        // the export contract and prevent "does not provide an export named X" errors.
        let required_exports = extract_required_exports_from_main(&main_ts_content, name);
        let export_contract_block = if required_exports.is_empty() {
            String::new()
        } else {
            format!(
                "\n## REQUIRED EXPORTS — do not remove or rename these\n\
                 main.ts currently imports these names from this feature module. \
                 You MUST export all of them or the app will crash at runtime:\n{}\n\
                 If the feature no longer needs one of these, keep the export as a no-op \
                 rather than removing it.\n",
                required_exports.iter().map(|e| format!("- `{}`", e)).collect::<Vec<_>>().join("\n")
            )
        };

        let prompt = if existing.is_empty() {
            let base_dir = globs[0].trim_end_matches('/').trim_end_matches("/**");
            let base_dir = if base_dir.is_empty() { "src" } else { base_dir };
            format!(
                r#"You are a senior software engineer. Create NEW code that implements this specification.
There is no existing code yet — generate one or more files that work together (imports, entry points, etc.).
{lang}.
{interactive}{deps}{unresolved_warning}Do NOT derive file names from the vibe document name (e.g. "overview.md"). Name files by the feature's purpose and use conventional, best-practice naming for the language and project (e.g. calculator.py, components/Calculator.tsx). Place all files under {base_dir}/.

{grammar}

{defensive}
{export_contract}{integrations}{data_schema}{shared}
## Vibe Specification
```markdown
{spec}
```
{never}
Output EVERY file using this exact format — no JSON, no escaping, no markdown fences:

===FILE:path/to/file.ext===
<full file content here>
===ENDFILE===

Use forward slashes. All files must work together. You may update global project files (index.html, src/main.ts) if needed to wire up this feature."#,
                lang = lang_instruction,
                interactive = interactive_block,
                deps = dep_block,
                unresolved_warning = unresolved_warning,
                base_dir = base_dir,
                grammar = GRAMMAR_CONTEXT,
                defensive = DEFENSIVE_CODING_RULES,
                export_contract = export_contract_block,
                integrations = integration_block,
                data_schema = shared_data_block,
                shared = shared_context_block,
                spec = content,
                never = never_block,
            )
        } else {
            let files_block: String = existing
                .iter()
                .map(|(path, c)| format!("===FILE:{}===\n{}\n===ENDFILE===\n\n", path, c))
                .collect();
            format!(
                r#"You are a senior software engineer. Update the existing code to implement this specification.
{lang}.
{interactive}{deps}{unresolved_warning}You may modify existing files and/or add new ones. All output files must work together (correct imports, exports, entry points).

{grammar}

{defensive}
{export_contract}{integrations}{data_schema}{shared}
## Vibe Specification
```markdown
{spec}
```
{never}
## Existing Code
{existing}
Output ONLY the files you change or add using this exact format — no JSON, no escaping, no markdown fences:

===FILE:path/to/file.ext===
<full file content here>
===ENDFILE===

If no changes are needed, output nothing. You may update global project files (index.html, src/main.ts) if needed."#,
                lang = lang_instruction,
                interactive = interactive_block,
                deps = dep_block,
                unresolved_warning = unresolved_warning,
                grammar = GRAMMAR_CONTEXT,
                defensive = DEFENSIVE_CODING_RULES,
                export_contract = export_contract_block,
                integrations = integration_block,
                data_schema = shared_data_block,
                shared = shared_context_block,
                spec = content,
                never = never_block,
                existing = files_block,
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
                        // ── Test generation ────────────────────────────────────────
                        // Generate/refresh a Vitest file when the spec's acceptance
                        // criteria have changed since the last compilation.
                        let criteria = extract_acceptance_criteria(content);
                        if !criteria.is_empty() && root_path.join("package.json").exists() {
                            let hash = spec_hash(content);
                            if test_manifest.get(name.as_str()).copied() != Some(hash) {
                                if generate_feature_tests(
                                    &client, &api_key, &root_path, name, content, &criteria,
                                ).await {
                                    test_manifest.insert(name.clone(), hash);
                                    test_manifest_dirty = true;
                                    generated += 1;
                                }
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

    // ── Post-generation: persist manifests ────────────────────────────────────
    // Architecture manifest: captures DOM IDs and module layout for future runs.
    write_arch_manifest(&root_path);
    // Test manifest: records which spec hash each feature's tests were generated from.
    if test_manifest_dirty {
        if let Ok(json) = serde_json::to_string_pretty(&test_manifest) {
            let _ = fs::write(&test_manifest_path, json);
        }
    }

    // Repair missing CSS/asset imports before tsc runs (Vite fails on these before TS even checks).
    repair_missing_css_imports(&root_path);
    // Ensure index.html has the script tag (model often forgets it).
    repair_html_script_tag(&root_path);

    // Post-generation: type-check TypeScript and auto-fix any errors
    let fix_note = validate_and_fix(&client, &api_key, &root_path).await;

    // ── Tool manifest: write .vibe/tool-manifest.json and register in global registry ──
    let _ = write_tool_manifest(&root_path);
    let _ = register_tool(&root);

    Ok(format!(
        "Compilation finished. {} feature(s) processed, {} file(s) written.{}",
        features.len(),
        generated,
        fix_note
    ))
}

/// Read a .vibe/integrations/{Name}.md (or legacy .yaml) file and return its content.
/// Returns None if the file doesn't exist.
fn read_integration_file(integrations_dir: &std::path::Path, service_name: &str) -> Option<String> {
    let md = integrations_dir.join(format!("{}.md", service_name));
    let yaml = integrations_dir.join(format!("{}.yaml", service_name));
    fs::read_to_string(&md).or_else(|_| fs::read_to_string(&yaml)).ok()
}

/// Parse `requires.env` from an integration .md frontmatter and check each var is set.
/// Returns (all_set: bool, missing: Vec<String>).
fn check_integration_env(content: &str) -> (bool, Vec<String>) {
    let fm = match extract_frontmatter(content) {
        Some(fm) => fm.to_string(),
        None => return (true, vec![]),
    };
    // Collect env vars from requires.env: [A, B] and auth.env: VAR
    let mut vars: Vec<String> = parse_fm_inline_list(&fm, "requires.env");
    for line in fm.lines() {
        let t = line.trim();
        if t.starts_with("env:") && !t.contains('[') {
            if let Some(v) = t.splitn(2, ':').nth(1) {
                let v = v.trim().trim_matches('"').to_string();
                if !v.is_empty() && !vars.contains(&v) { vars.push(v); }
            }
        }
    }
    let missing: Vec<String> = vars.into_iter()
        .filter(|v| std::env::var(v).map(|s| s.trim().is_empty()).unwrap_or(true))
        .collect();
    (missing.is_empty(), missing)
}

/// Build the integration context block for a feature's codegen prompt.
/// Reads each service listed in Connects: from .vibe/integrations/, warns if env vars missing.
fn build_integration_context(
    content: &str,
    integrations_dir: &std::path::Path,
) -> String {
    let fm = match extract_frontmatter(content) {
        Some(fm) => fm,
        None => return String::new(),
    };
    let connects = parse_fm_inline_list(fm, "Connects");
    if connects.is_empty() { return String::new(); }

    let mut block = String::from("\n## External integrations (from .vibe/integrations/)\n");
    let mut found_any = false;
    for service in &connects {
        if let Some(int_content) = read_integration_file(integrations_dir, service) {
            let (all_set, missing) = check_integration_env(&int_content);
            found_any = true;
            if all_set {
                block.push_str(&format!("### {}\n{}\n\n", service, int_content));
            } else {
                block.push_str(&format!(
                    "### {} ⚠️ MISSING ENV VARS: {}\n\
                     The following environment variables are not set. Generate code that handles \
                     missing credentials gracefully (show a configuration prompt rather than crashing):\n{}\n\
                     {}\n\n",
                    service,
                    missing.join(", "),
                    missing.iter().map(|v| format!("- {}", v)).collect::<Vec<_>>().join("\n"),
                    int_content
                ));
            }
        }
    }
    if found_any { block } else { String::new() }
}

/// Extract the path string from a JS/TS import statement, e.g.:
///   import "./style.css"          → "./style.css"
///   import { foo } from "./bar"   → "./bar"
fn extract_import_path(line: &str) -> Option<&str> {
    let line = line.trim();
    if !line.starts_with("import") { return None; }
    for &q in &['"', '\''] {
        if let Some(end) = line.rfind(q) {
            let before = &line[..end];
            if let Some(start) = before.rfind(q) {
                let path = &line[start + 1..end];
                if !path.is_empty() { return Some(path); }
            }
        }
    }
    None
}

/// Scan generated TS/JS files for relative imports of non-TS files (CSS, SCSS, etc.) that
/// don't exist on disk. Creates empty stub files so Vite doesn't abort the dev server.
/// TypeScript import errors are already handled by validate_and_fix via tsc.
fn repair_missing_css_imports(root: &std::path::Path) -> usize {
    let src = root.join("src");
    if !src.exists() { return 0; }
    let mut created = 0usize;
    let entries: Vec<_> = WalkDir::new(&src).max_depth(5).into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            if !e.file_type().is_file() { return false; }
            let ext = e.path().extension().and_then(|x| x.to_str()).unwrap_or("");
            matches!(ext, "ts" | "tsx" | "js")
        })
        .collect();
    for entry in entries {
        let Ok(content) = fs::read_to_string(entry.path()) else { continue };
        for line in content.lines() {
            let Some(path) = extract_import_path(line) else { continue };
            if !path.starts_with('.') { continue } // skip package imports
            let ext = std::path::Path::new(path)
                .extension().and_then(|e| e.to_str()).unwrap_or("");
            if !matches!(ext, "css" | "scss" | "sass" | "less" | "styl") { continue }
            let dir = entry.path().parent().unwrap_or(&src);
            let target = dir.join(path);
            if !target.exists() {
                if let Some(parent) = target.parent() { let _ = fs::create_dir_all(parent); }
                if fs::write(&target, "/* auto-generated stub */\n").is_ok() {
                    created += 1;
                }
            }
        }
    }
    created
}

/// Run `tsc --noEmit` and return the error output, or None if clean / tsc unavailable.
fn run_tsc(root_path: &std::path::Path) -> Option<String> {
    let out = std::process::Command::new("npx")
        .args(["tsc", "--noEmit", "--pretty", "false"])
        .current_dir(root_path)
        .output()
        .ok()?;
    if out.status.success() { return None; }
    let errors = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let errors = errors.trim().to_string();
    if errors.is_empty() { None } else { Some(errors) }
}

/// Extract unique errored TS file paths from tsc output lines like:
///   src/main.ts(111,17): error TS2345: ...
fn tsc_error_paths(errors: &str) -> Vec<String> {
    let mut paths: Vec<String> = errors
        .lines()
        .filter_map(|line| {
            let p = line.trim().split('(').next()?.trim();
            if p.ends_with(".ts") || p.ends_with(".tsx") { Some(p.to_string()) } else { None }
        })
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    paths.sort();
    paths
}

/// Iterative validate-and-fix: runs tsc, asks the model to fix errors, then re-checks.
/// Loops up to MAX_FIX_ROUNDS times so a bad first fix doesn't leave the project broken.
/// Returns a short summary string appended to the compile result message.
async fn validate_and_fix(
    client: &reqwest::Client,
    api_key: &str,
    root_path: &std::path::Path,
) -> String {
    const MAX_FIX_ROUNDS: usize = 3;

    if !root_path.join("tsconfig.json").exists() {
        return String::new();
    }

    let mut total_fixed = 0usize;
    let mut rounds = 0usize;

    loop {
        let errors = match run_tsc(root_path) {
            None => break, // clean — done
            Some(e) => e,
        };

        rounds += 1;
        if rounds > MAX_FIX_ROUNDS {
            // Exhausted retries — surface the remaining error count
            let count = errors.lines()
                .filter(|l| l.contains(": error TS"))
                .count();
            return format!(
                " {} TypeScript error(s) remain after {} fix attempt(s). Check the console.",
                count, MAX_FIX_ROUNDS
            );
        }

        let file_paths = tsc_error_paths(&errors);
        let files_block: String = file_paths.iter()
            .filter_map(|rel| {
                let content = fs::read_to_string(root_path.join(rel)).ok()?;
                Some(format!("===FILE:{}===\n{}\n===ENDFILE===\n\n", rel, content))
            })
            .collect();

        if files_block.is_empty() {
            // Can't map errors to files — give up gracefully
            let count = errors.lines().filter(|l| l.contains(": error TS")).count();
            return format!(" ({} TypeScript error(s); could not locate source files)", count);
        }

        let fix_prompt = format!(
            r#"Fix ALL TypeScript compilation errors below. Preserve all existing logic — only change what is needed to fix the errors.

{defensive}

TypeScript errors (round {round} of {max}):
```
{errors}
```

Files to fix:
{files}
Output ONLY the fixed files — no JSON, no markdown, no explanation:

===FILE:path/to/file.ts===
<full corrected file content>
===ENDFILE===
"#,
            defensive = DEFENSIVE_CODING_RULES,
            round = rounds,
            max = MAX_FIX_ROUNDS,
            errors = errors,
            files = files_block,
        );

        match call_gemini(client, api_key, &fix_prompt).await {
            Ok(text) => match parse_codegen_response(&text) {
                Ok(fixes) if !fixes.is_empty() => {
                    for (rel_path, content) in fixes {
                        let abs = root_path.join(&rel_path);
                        // Only overwrite files that exist — don't let the model create new ones here
                        if abs.exists() && fs::write(&abs, &content).is_ok() {
                            total_fixed += 1;
                            // Repair any new missing CSS imports the fix may have introduced
                            repair_missing_css_imports(root_path);
                        }
                    }
                }
                _ => break, // model returned nothing useful — stop
            },
            Err(_) => break,
        }
    }

    if total_fixed > 0 {
        format!(" Auto-fixed TypeScript errors in {} pass(es).", rounds)
    } else {
        String::new()
    }
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
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={api_key}",
            codegen_model()
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
         {grammar_ref}\n\n\
         Current project root: {root}\n\
         Current feature: {feature_name}{grammar_summary}\n\n\
         Current Vibe file content:\n```markdown\n{vibe_context}\n```\n\n\
         When suggesting changes, preserve and update the grammar frontmatter.\n\n\
         CRITICAL RULE — new feature files: If your response involves creating a NEW feature file \
         (one that does not yet exist), you MUST NOT suggest applying it to the current file. \
         Instead, show the full content for the new file in a fenced code block labeled with the \
         feature slug (e.g. **user-auth** followed by the markdown block), and emit a \
         create_feature action for it. Only emit an 'apply' action for changes to the CURRENT \
         feature file ({feature_name}).\n\n\
         IMPORTANT: After every response, append a line containing exactly '---actions---' followed by a \
         JSON array of 2-4 suggested next actions. Use this format:\n\
         ---actions---\n\
         [{{\"type\":\"reply\",\"label\":\"...\",\"text\":\"...\"}},{{\"type\":\"apply\",\"label\":\"Update {feature_name}\"}}]\n\n\
         Action types:\n\
         - {{\"type\":\"reply\",\"label\":\"...\",\"text\":\"...\"}} - a follow-up message the user can send with one click\n\
         - {{\"type\":\"apply\",\"label\":\"Update {feature_name}\"}} - apply suggested edits to the CURRENT file only\n\
         - {{\"type\":\"create_feature\",\"label\":\"Create <name>\",\"name\":\"<kebab-case-slug>\"}} - create a brand new feature file; use when you suggest a new .md file\n\
         - {{\"type\":\"integration\",\"label\":\"Set up integration\"}} - open the integration setup panel\n\
         Only emit 'apply' for the current file. Emit 'create_feature' for every new file suggested. \
         Always include at least one reply action. Keep labels short (3-5 words).",
        grammar_ref = GRAMMAR_CONTEXT
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
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={api_key}",
            codegen_model()
    );

    let prompt = format!(
        r#"You are applying suggested edits to a specific Vibe (feature specification) markdown file. The user asked for changes in chat and the assistant replied with a suggestion. Your task is to output the COMPLETE updated content for the target file only.

Target file: **{feature_name}**

{grammar_ref}

Rules for applying edits:
1. Only apply changes relevant to **{feature_name}**. The assistant's message may contain content for other feature files — ignore those entirely.
2. PRESERVE all existing content that the assistant did NOT explicitly change. This is critical — the current file contains \
detailed specs that must not be lost. Only add, modify, or remove content that the assistant specifically suggested changing.
3. If the current file has grammar frontmatter (---...---), preserve it and update it to reflect any new dependencies, entities, or constraints implied by the changes.
4. If the current file has no grammar frontmatter, add it at the top with appropriate values inferred from the content.
5. All names in Uses and Data must be PascalCase (e.g. UserAuthentication, PaymentMethod).
6. Never reduce the level of detail. If the original has specific bullet points, keep them. Only remove content the assistant explicitly said to remove.

Current file content:
```markdown
{current_content}
```

Assistant's suggestion (apply only the parts relevant to {feature_name}):
```
{last_assistant_message}
```

Output ONLY the complete updated markdown for **{feature_name}**. No code fences, no explanation. Just the raw markdown."#,
        feature_name = feature_name,
        grammar_ref = GRAMMAR_CONTEXT,
        current_content = current_content,
        last_assistant_message = last_assistant_message
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

#[derive(serde::Serialize)]
pub struct GeneratedIntegration {
    pub service_name: String,
    /// Full .md file content (YAML frontmatter + prose sections).
    pub content: String,
    /// Credential field names that must be filled in by the user (empty in the generated file).
    pub empty_fields: Vec<String>,
}

#[tauri::command]
pub async fn generate_integration(_root: String, description: String) -> Result<GeneratedIntegration, String> {
    let api_key = std::env::var("GEMINI_API_KEY")
        .map_err(|_| "GEMINI_API_KEY not set. Set it in .env and run with `make desktop`.")?;
    let client = reqwest::Client::new();

    let prompt = format!(
        r#"You are a configuration generator for VibeHub integrations.

The user wants to integrate with an external service. Their description:
"{description}"

Generate an integration spec file in this exact format — YAML frontmatter followed by prose markdown sections:

---
service: ServiceName          # PascalCase, no spaces (e.g. Stripe, GoogleSheets, Twilio)
auth:
  type: api_key               # one of: api_key | oauth2 | basic | none
  env: SERVICE_API_KEY        # environment variable name that holds the credential (omit if none)
requires:
  env: [SERVICE_API_KEY]      # list every env var the user must set before this works
operations:
  - OperationName             # PascalCase, 3-6 key operations for this use case
  - AnotherOperation
---

## What it does
2-3 sentences describing what this integration enables in plain language.

## How to use it
Concrete instructions for the AI when writing code that uses this integration:
- Which SDK or library to use (npm package name, import path)
- How to initialise the client (use process.env.SERVICE_API_KEY, never hardcode)
- The key API calls to use for each operation listed above
- Any rate limits, pagination patterns, or gotchas to be aware of

## Never
- Any hard constraints the AI must never violate when using this integration
- e.g. never log credentials, never expose secrets to the client, etc.

Rules:
- Use PascalCase for `service` and operation names
- The `env` field under `auth` must be the actual environment variable name (e.g. STRIPE_SECRET_KEY)
- `requires.env` must list every env var the user needs to set
- The prose sections are for the AI code generator — write them to be maximally useful for that purpose
- Return ONLY the file content (frontmatter + prose), no surrounding markdown fences

Generate the integration spec now:"#
    );

    let raw = call_gemini(&client, &api_key, &prompt).await?;

    // Strip any accidental outer code fences
    let content = raw
        .trim()
        .trim_start_matches("```markdown")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();

    // Extract service name from the frontmatter
    let service_name = extract_frontmatter(&content)
        .and_then(|fm| {
            fm.lines()
                .find(|l| l.trim_start().starts_with("service:"))
                .and_then(|l| l.splitn(2, ':').nth(1))
                .map(|s| s.trim().trim_matches('"').to_string())
        })
        .unwrap_or_else(|| "Integration".to_string());

    // Extract required env vars from requires.env in the frontmatter
    let empty_fields: Vec<String> = extract_frontmatter(&content)
        .map(|fm| parse_fm_inline_list(fm, "requires.env")
            .into_iter()
            .chain(
                // Also pick up auth.env as a single value
                fm.lines()
                    .find(|l| l.trim().starts_with("env:") && !l.contains('['))
                    .and_then(|l| l.splitn(2, ':').nth(1))
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .into_iter()
            )
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect())
        .unwrap_or_default();

    Ok(GeneratedIntegration { service_name, content, empty_fields })
}

#[tauri::command]
pub async fn write_integration_file(root: String, service_name: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&root)
        .join(".vibe")
        .join("integrations")
        .join(format!("{}.md", service_name));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

/// Create a new vibe project: scaffolds .vibe/features/, a starter feature, and Vite app skeleton.
#[tauri::command]
pub async fn create_new_project(path: String, name: String) -> Result<(), String> {
    let root = PathBuf::from(&path);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    // Scaffold .vibe/features/ with a starter feature
    let features_dir = root.join(".vibe").join("features");
    fs::create_dir_all(&features_dir).map_err(|e| e.to_string())?;

    let starter = format!(
        r#"---
Uses: []
Data: []
Never:
  - do not use alert() or document.write()
Variables: []
Connects: []
---

# {name}

## What it does
Describe what this tool does.

## Behavior
- Add specific rules and edge cases here

## Acceptance criteria
- How do you know this tool is working correctly?
"#,
        name = name,
    );
    fs::write(
        features_dir.join("overview.md"),
        starter.as_bytes(),
    ).map_err(|e| e.to_string())?;

    // Scaffold Vite app skeleton
    scaffold_vite_app(&root)?;

    // Init git
    let repo = git2::Repository::init(&root).map_err(|e| e.to_string())?;
    {
        let sig = repo.signature().unwrap_or_else(|_|
            git2::Signature::now("Vibe Studio", "vibe@local").unwrap()
        );
        let mut index = repo.index().map_err(|e| e.to_string())?;
        index.add_all(["*"], git2::IndexAddOption::DEFAULT, None).map_err(|e| e.to_string())?;
        index.write().map_err(|e| e.to_string())?;
        let oid = index.write_tree().map_err(|e| e.to_string())?;
        let tree = repo.find_tree(oid).map_err(|e| e.to_string())?;
        repo.commit(Some("HEAD"), &sig, &sig, "Initial vibe project", &tree, &[])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ─── Tool Registry & Manifest ────────────────────────────────────────────────

/// A variable a tool requires to function (e.g. API key, config value).
#[derive(Serialize, Deserialize, Clone)]
pub struct ToolVariable {
    pub name: String,
    pub description: String,
    pub required: bool,
}

/// Manifest written to .vibe/tool-manifest.json after compilation.
#[derive(Serialize, Deserialize, Clone)]
pub struct ToolManifest {
    pub name: String,
    pub description: String,
    pub variables: Vec<ToolVariable>,
    pub connects: Vec<String>,
}

/// An entry in the global tool registry (~/.vibehub/tools.json).
#[derive(Serialize, Deserialize, Clone)]
pub struct ToolRegistryEntry {
    pub root: String,
    pub name: String,
    pub description: String,
    pub variables: Vec<ToolVariable>,
    pub connects: Vec<String>,
}

fn tools_registry_path() -> PathBuf {
    vibehub_data_dir().join("tools.json")
}

fn vibehub_data_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".vibehub")
}

fn read_tools_registry() -> Vec<ToolRegistryEntry> {
    let path = tools_registry_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_tools_registry(entries: &[ToolRegistryEntry]) -> Result<(), String> {
    let path = tools_registry_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// Register a compiled project as a tool in the global registry.
/// Called after compile_vibes writes tool-manifest.json.
fn register_tool(root: &str) -> Result<(), String> {
    let manifest_path = PathBuf::from(root).join(".vibe").join("tool-manifest.json");
    let raw = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let manifest: ToolManifest = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let mut registry = read_tools_registry();
    // Upsert: remove old entry for this root, then add new one.
    registry.retain(|e| e.root != root);
    registry.push(ToolRegistryEntry {
        root: root.to_string(),
        name: manifest.name,
        description: manifest.description,
        variables: manifest.variables,
        connects: manifest.connects,
    });
    write_tools_registry(&registry)
}

/// Ensure a project with .vibe/features/ is registered as a tool.
/// Generates tool-manifest.json if missing, then upserts the registry.
#[tauri::command]
pub async fn register_project_as_tool(root: String) -> Result<(), String> {
    let root_path = PathBuf::from(&root);
    let features_dir = root_path.join(".vibe").join("features");
    if !features_dir.exists() {
        return Ok(()); // Not a vibe project — nothing to register
    }
    // Generate manifest if it doesn't exist or refresh it
    write_tool_manifest(&root_path)?;
    register_tool(&root)
}

/// List all known tools from the global registry.
#[tauri::command]
pub async fn list_tools() -> Result<Vec<ToolRegistryEntry>, String> {
    Ok(read_tools_registry())
}

/// Remove a tool from the registry (does not delete project files).
#[tauri::command]
pub async fn unregister_tool(root: String) -> Result<(), String> {
    let mut registry = read_tools_registry();
    registry.retain(|e| e.root != root);
    write_tools_registry(&registry)
}

/// Read the tool config (.vibe/tool-config.json) — user-supplied variable values.
#[tauri::command]
pub async fn read_tool_config(root: String) -> Result<HashMap<String, String>, String> {
    let path = PathBuf::from(&root).join(".vibe").join("tool-config.json");
    let raw = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// Save user-supplied variable values to .vibe/tool-config.json.
#[tauri::command]
pub async fn save_tool_config(root: String, config: HashMap<String, String>) -> Result<(), String> {
    let path = PathBuf::from(&root).join(".vibe").join("tool-config.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// Extract required variables from all feature specs and integration files.
/// Variables come from:
/// 1. Integration frontmatter `requires.env` fields
/// 2. Explicit `Variables:` grammar field in feature specs
fn extract_tool_variables(root: &std::path::Path) -> Vec<ToolVariable> {
    let mut vars: Vec<ToolVariable> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // From integration files
    let integrations_dir = root.join(".vibe").join("integrations");
    if integrations_dir.exists() {
        if let Ok(entries) = fs::read_dir(&integrations_dir) {
            for entry in entries.flatten() {
                let content = fs::read_to_string(entry.path()).unwrap_or_default();
                if let Some(fm) = extract_frontmatter(&content) {
                    let env_vars = parse_fm_inline_list(fm, "requires.env");
                    for v in env_vars {
                        if seen.insert(v.clone()) {
                            vars.push(ToolVariable {
                                name: v.clone(),
                                description: format!("Required by {} integration", entry.path().file_stem().unwrap_or_default().to_string_lossy()),
                                required: true,
                            });
                        }
                    }
                }
            }
        }
    }

    // From feature specs — look for Variables: field in frontmatter
    let features_dir = root.join(".vibe").join("features");
    if features_dir.exists() {
        if let Ok(entries) = fs::read_dir(&features_dir) {
            for entry in entries.flatten() {
                let content = fs::read_to_string(entry.path()).unwrap_or_default();
                if let Some(fm) = extract_frontmatter(&content) {
                    let feature_vars = parse_fm_inline_list(fm, "Variables");
                    for v in feature_vars {
                        if seen.insert(v.clone()) {
                            vars.push(ToolVariable {
                                name: v.clone(),
                                description: format!("Used by {}", entry.path().file_stem().unwrap_or_default().to_string_lossy()),
                                required: true,
                            });
                        }
                    }
                }
            }
        }
    }

    vars
}

/// Build a tool manifest from the current project state.
fn write_tool_manifest(root: &std::path::Path) -> Result<(), String> {
    let vibe_dir = root.join(".vibe");

    // Derive name from directory name
    let name = root.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Derive description from the first feature's first paragraph, or folder name
    let mut description = format!("{} tool", name);
    let features_dir = vibe_dir.join("features");
    if features_dir.exists() {
        if let Ok(mut entries) = fs::read_dir(&features_dir) {
            if let Some(Ok(entry)) = entries.next() {
                let content = fs::read_to_string(entry.path()).unwrap_or_default();
                for line in content.lines() {
                    let t = line.trim();
                    if !t.is_empty() && !t.starts_with('#') && !t.starts_with("---")
                        && !t.starts_with("Uses:") && !t.starts_with("Connects:")
                        && !t.starts_with("Data:") && !t.starts_with("Never:")
                        && !t.starts_with("Variables:")
                    {
                        description = t.to_string();
                        break;
                    }
                }
            }
        }
    }

    // Collect all Connects: across features
    let mut connects: Vec<String> = Vec::new();
    if features_dir.exists() {
        if let Ok(entries) = fs::read_dir(&features_dir) {
            for entry in entries.flatten() {
                let content = fs::read_to_string(entry.path()).unwrap_or_default();
                if let Some(fm) = extract_frontmatter(&content) {
                    for c in parse_fm_inline_list(fm, "Connects") {
                        if !connects.contains(&c) {
                            connects.push(c);
                        }
                    }
                }
            }
        }
    }

    let variables = extract_tool_variables(root);

    let manifest = ToolManifest { name, description, variables, connects };
    let json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    fs::write(vibe_dir.join("tool-manifest.json"), json).map_err(|e| e.to_string())?;
    Ok(())
}
