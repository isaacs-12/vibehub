// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{
    apply_chat_to_vibe_file, chat_with_vibes, compile_vibes, delete_vibe_file, get_git_state,
    get_mapped_code, git_checkout, git_create_branch, git_init, list_vibe_features, load_chats,
    merge_branch_locally, pull_from_remote, push_branch_to_backend, read_remote_config,
    rename_vibe_file, run_project, stop_project, save_chats, write_vibe_file, write_remote_config,
    RunState,
};
use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(RunState(Arc::new(Mutex::new(None::<u32>))))
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
