mod commands;

use commands::{ai, export, files, settings, zola};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            files::select_folder,
            files::list_markdown_files,
            files::read_markdown_file,
            files::save_markdown_file,
            files::create_markdown_file,
            files::get_file_tree,
            zola::build_site,
            zola::preview_site,
            ai::ai_complete,
            ai::ai_generate_page,
            ai::ai_summarize,
            ai::ai_suggest_structure,
            ai::ai_generate_metadata,
            ai::list_ollama_models,
            ai::check_ollama_status,
            settings::get_settings,
            settings::save_settings,
            export::export_site,
            export::remove_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Frontdocs");
}
