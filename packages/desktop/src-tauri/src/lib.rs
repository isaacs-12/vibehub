// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{
    apply_chat_to_vibe_file, chat_with_vibes, compile_vibes, create_new_project,
    delete_vibe_file, generate_integration, get_git_state, get_mapped_code, git_checkout,
    git_create_branch, git_init, list_tools, list_vibe_features, load_chats,
    merge_branch_locally, pull_from_remote, push_branch_to_backend, read_remote_config,
    read_tool_config, register_project_as_tool, rename_vibe_file, run_project, save_chats,
    save_tool_config, stop_project, unregister_tool, write_integration_file, write_remote_config,
    write_vibe_file, RunState,
};
use std::sync::Arc;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

/// Returns the current app version from Cargo.toml at compile time.
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Check for updates by fetching the latest GitHub release tag.
#[tauri::command]
async fn check_for_updates() -> Result<serde_json::Value, String> {
    let current = env!("CARGO_PKG_VERSION");
    let client = reqwest::Client::builder()
        .user_agent("VibeStudio")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://api.github.com/repos/isaacs-12/vibehub/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if resp.status().as_u16() == 404 {
        return Ok(serde_json::json!({
            "current": current,
            "latest": current,
            "update_available": false,
            "message": "No releases found yet."
        }));
    }

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let tag = body["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v');
    let html_url = body["html_url"].as_str().unwrap_or("");

    let update_available = tag != current && !tag.is_empty();

    Ok(serde_json::json!({
        "current": current,
        "latest": tag,
        "update_available": update_available,
        "release_url": html_url,
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(RunState(Arc::new(Mutex::new(None::<u32>))))
        .setup(|app| {
            // ── VibeStudio (app) menu ─────────────────────────────────────────
            let about = MenuItemBuilder::new("About VibeStudio")
                .id("app-about")
                .build(app)?;

            let check_updates = MenuItemBuilder::new("Check for Updates…")
                .id("app-check-updates")
                .build(app)?;

            let app_menu = SubmenuBuilder::new(app, "VibeStudio")
                .item(&about)
                .item(&check_updates)
                .separator()
                .item(&PredefinedMenuItem::hide(app, Some("Hide VibeStudio"))?)
                .item(&PredefinedMenuItem::hide_others(app, Some("Hide Others"))?)
                .item(&PredefinedMenuItem::show_all(app, Some("Show All"))?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, Some("Quit VibeStudio"))?)
                .build()?;

            // ── File menu ─────────────────────────────────────────────────────
            let new_project = MenuItemBuilder::new("New Project…")
                .id("file-new-project")
                .accelerator("CmdOrCtrl+Shift+N")
                .build(app)?;

            let open_project = MenuItemBuilder::new("Open Project…")
                .id("file-open-project")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;

            let save = MenuItemBuilder::new("Save")
                .id("file-save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_project)
                .item(&open_project)
                .separator()
                .item(&save)
                .separator()
                .close_window()
                .build()?;

            // ── Edit menu ─────────────────────────────────────────────────────
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            // ── View menu ─────────────────────────────────────────────────────
            let toggle_code_peek = MenuItemBuilder::new("Toggle Code Peek")
                .id("view-toggle-code-peek")
                .accelerator("CmdOrCtrl+Shift+C")
                .build(app)?;

            let toggle_output = MenuItemBuilder::new("Toggle Output Panel")
                .id("view-toggle-output")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(app)?;

            let toggle_chat = MenuItemBuilder::new("Toggle Vibe Chat")
                .id("view-toggle-chat")
                .accelerator("CmdOrCtrl+Shift+K")
                .build(app)?;

            let mode_editor = MenuItemBuilder::new("Editor Mode")
                .id("view-mode-editor")
                .accelerator("CmdOrCtrl+1")
                .build(app)?;

            let mode_tools = MenuItemBuilder::new("Tools Mode")
                .id("view-mode-tools")
                .accelerator("CmdOrCtrl+2")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&mode_editor)
                .item(&mode_tools)
                .separator()
                .item(&toggle_code_peek)
                .item(&toggle_output)
                .item(&toggle_chat)
                .separator()
                .fullscreen()
                .build()?;

            // ── Window menu ───────────────────────────────────────────────────
            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            // ── Help menu ─────────────────────────────────────────────────────
            let docs = MenuItemBuilder::new("VibeStudio Documentation")
                .id("help-docs")
                .build(app)?;

            let report_issue = MenuItemBuilder::new("Report an Issue…")
                .id("help-report-issue")
                .build(app)?;

            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&docs)
                .item(&report_issue)
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[
                    &app_menu,
                    &file_menu,
                    &edit_menu,
                    &view_menu,
                    &window_menu,
                    &help_menu,
                ])
                .build()?;

            app.set_menu(menu)?;

            // ── Menu event handler ────────────────────────────────────────────
            app.on_menu_event(move |app_handle, event| {
                let id = event.id().as_ref().to_string();
                // Open external URLs for help items
                match id.as_str() {
                    "help-docs" => {
                        let _ = open::that("https://getvibehub.com/docs/vibestudio");
                    }
                    "help-report-issue" => {
                        let _ = open::that("https://github.com/isaacs-12/vibehub/issues/new");
                    }
                    _ => {
                        // Forward all other menu events to the frontend
                        println!("[menu] forwarding event: {}", id);
                        let _ = app_handle.emit("menu-event", &id);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_vibe_features,
            write_vibe_file,
            delete_vibe_file,
            rename_vibe_file,
            get_mapped_code,
            get_git_state,
            git_checkout,
            git_create_branch,
            git_init,
            compile_vibes,
            chat_with_vibes,
            apply_chat_to_vibe_file,
            push_branch_to_backend,
            pull_from_remote,
            save_chats,
            load_chats,
            read_remote_config,
            write_remote_config,
            run_project,
            stop_project,
            merge_branch_locally,
            generate_integration,
            write_integration_file,
            list_tools,
            register_project_as_tool,
            unregister_tool,
            read_tool_config,
            save_tool_config,
            create_new_project,
            get_app_version,
            check_for_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
