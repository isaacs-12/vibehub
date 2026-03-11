use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

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

// ─── Git Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_git_state(root: String) -> Result<GitState, String> {
    let repo = git2::Repository::open(&root).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();

    let mut branches = Vec::new();
    for b in repo.branches(Some(git2::BranchType::Local)).map_err(|e| e.to_string())? {
        if let Ok((branch_ref, _)) = b {
            if let Some(name) = branch_ref.name().ok().flatten() {
                branches.push(name.to_string());
            }
        }
    }
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

#[tauri::command]
pub async fn git_create_branch(root: String, name: String) -> Result<(), String> {
    let repo = git2::Repository::open(&root).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    repo.branch(&name, &commit, false).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── AI Commands ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn compile_vibes(root: String) -> Result<String, String> {
    // In production this calls the Gemini API to translate Vibe files → code.
    // For MVP we return a stub that logs the intent.
    let features_dir = PathBuf::from(&root).join(".vibe").join("features");
    let count = WalkDir::new(&features_dir)
        .into_iter()
        .filter(|e| {
            e.as_ref()
                .map(|e| e.path().extension().and_then(|x| x.to_str()) == Some("md"))
                .unwrap_or(false)
        })
        .count();
    Ok(format!(
        "Compilation triggered for {count} vibe files. Connect GEMINI_API_KEY to enable full AI compilation."
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
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
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
    let text = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("(empty response)")
        .to_string();
    Ok(text)
}
