use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub output_format: String,       // "folder" or "archive"
    pub output_path: Option<String>, // None = save near input
    pub ai_provider: String,         // "ollama" or "external"
    pub ollama_url: String,
    pub ollama_model: String,
    pub external_api_url: String,
    pub external_api_key: String,
    pub external_model: String,
    pub theme: String,
    pub base_url: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            output_format: "folder".to_string(),
            output_path: None,
            ai_provider: "ollama".to_string(),
            ollama_url: "http://localhost:11434".to_string(),
            ollama_model: String::new(),
            external_api_url: String::new(),
            external_api_key: String::new(),
            external_model: String::new(),
            theme: "dark".to_string(),
            base_url: "https://frontdocs.local".to_string(),
        }
    }
}

fn settings_path() -> Result<PathBuf, String> {
    let config_dir = dirs_config_dir()?;
    let app_dir = config_dir.join("frontdocs");
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_dir.join("settings.json"))
}

fn dirs_config_dir() -> Result<PathBuf, String> {
    // Cross-platform config directory
    if let Ok(dir) = std::env::var("XDG_CONFIG_HOME") {
        return Ok(PathBuf::from(dir));
    }
    if let Ok(home) = std::env::var("HOME") {
        return Ok(PathBuf::from(home).join(".config"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return Ok(PathBuf::from(appdata));
    }
    Err("Cannot determine config directory".to_string())
}

#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("Invalid settings file: {}", e))
}

#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> Result<(), String> {
    let path = settings_path()?;
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
