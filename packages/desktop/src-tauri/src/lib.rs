// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{
    chat_with_vibes, compile_vibes, get_git_state, get_mapped_code, git_checkout,
    git_create_branch, git_init, list_vibe_features, run_project, write_vibe_file, RunState,
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
            get_mapped_code,
            get_git_state,
            git_checkout,
            git_create_branch,
            git_init,
            compile_vibes,
            chat_with_vibes,
            run_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
