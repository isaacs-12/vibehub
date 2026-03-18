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
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(RunState(Arc::new(Mutex::new(None::<u32>))))
        .setup(|app| {
            // ── Native application menu ──────────────────────────────────────
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
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&file_menu, &edit_menu])
                .build()?;

            app.set_menu(menu)?;

            // ── Menu event handler ───────────────────────────────────────────
            app.on_menu_event(move |app_handle, event| {
                let id = event.id().as_ref();
                let _ = app_handle.emit("menu-event", id);
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
