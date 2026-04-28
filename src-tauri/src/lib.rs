mod commands;

use commands::{ai, export, files, mkdocs, mdbook, settings};

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
            files::create_folder,
            files::get_file_tree,
            files::move_file,
            files::delete_file,
            files::delete_dir,
            mkdocs::build_site,
            mkdocs::preview_site,
            mkdocs::detect_project_type,
            mkdocs::convert_to_project,
            mdbook::build_site_mdbook,
            mdbook::preview_site_mdbook,
            mdbook::detect_project_type_mdbook,
            mdbook::convert_to_project_mdbook,
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
