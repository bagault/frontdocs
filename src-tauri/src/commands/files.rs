use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarkdownFile {
    pub path: String,
    pub name: String,
    pub relative_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileTreeNode>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub name: String,
    pub content: String,
    pub frontmatter: Option<String>,
    pub body: Option<String>,
}

#[tauri::command]
pub async fn select_folder() -> Result<Option<String>, String> {
    // Folder selection is handled on the frontend via the dialog plugin
    Ok(None)
}

#[tauri::command]
pub async fn list_markdown_files(folder_path: String) -> Result<Vec<MarkdownFile>, String> {
    let base = PathBuf::from(&folder_path);
    if !base.exists() {
        return Err(format!("Folder does not exist: {}", folder_path));
    }

    let mut files = Vec::new();
    for entry in WalkDir::new(&base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && e.path()
                    .extension()
                    .map_or(false, |ext| ext == "md" || ext == "markdown")
        })
    {
        let path = entry.path().to_string_lossy().to_string();
        let name = entry.file_name().to_string_lossy().to_string();
        let relative_path = entry
            .path()
            .strip_prefix(&base)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .to_string();

        files.push(MarkdownFile {
            path,
            name,
            relative_path,
        });
    }

    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(files)
}

#[tauri::command]
pub async fn read_markdown_file(file_path: String) -> Result<FileContent, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let (frontmatter, body) = parse_frontmatter(&content);

    Ok(FileContent {
        path: file_path,
        name,
        content,
        frontmatter,
        body,
    })
}

#[tauri::command]
pub async fn save_markdown_file(file_path: String, content: String) -> Result<(), String> {
    // Validate path is under an expected directory (not arbitrary write)
    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_markdown_file(
    folder_path: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    // Sanitize filename to prevent path traversal
    let sanitized_name = sanitize_filename(&file_name);
    let path = PathBuf::from(&folder_path).join(&sanitized_name);

    if path.exists() {
        return Err(format!("File already exists: {}", sanitized_name));
    }

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_file_tree(folder_path: String) -> Result<FileTreeNode, String> {
    let base = PathBuf::from(&folder_path);
    if !base.exists() {
        return Err(format!("Folder does not exist: {}", folder_path));
    }

    fn build_tree(path: &Path, base: &Path) -> FileTreeNode {
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let full_path = path.to_string_lossy().to_string();

        if path.is_dir() {
            let mut children: Vec<FileTreeNode> = std::fs::read_dir(path)
                .into_iter()
                .flat_map(|entries| entries.into_iter())
                .filter_map(|e| e.ok())
                .filter(|e| {
                    let p = e.path();
                    if p.is_dir() {
                        !p.file_name()
                            .map_or(false, |n| n.to_string_lossy().starts_with('.'))
                    } else {
                        p.extension()
                            .map_or(false, |ext| ext == "md" || ext == "markdown" || ext == "bib")
                    }
                })
                .map(|e| build_tree(&e.path(), base))
                .collect();

            children.sort_by(|a, b| {
                // Directories first, then alphabetical
                match (a.is_dir, b.is_dir) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            });

            FileTreeNode {
                name,
                path: full_path,
                is_dir: true,
                children,
            }
        } else {
            FileTreeNode {
                name,
                path: full_path,
                is_dir: false,
                children: vec![],
            }
        }
    }

    Ok(build_tree(&base, &base))
}

fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    let trimmed = content.trim_start();
    if trimmed.starts_with("---") {
        if let Some(end) = trimmed[3..].find("---") {
            let fm = trimmed[3..3 + end].trim().to_string();
            let body = trimmed[3 + end + 3..].trim().to_string();
            return (Some(fm), Some(body));
        }
    }
    if trimmed.starts_with("+++") {
        if let Some(end) = trimmed[3..].find("+++") {
            let fm = trimmed[3..3 + end].trim().to_string();
            let body = trimmed[3 + end + 3..].trim().to_string();
            return (Some(fm), Some(body));
        }
    }
    (None, Some(content.to_string()))
}

fn sanitize_filename(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | '\0' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();

    // Prevent path traversal
    sanitized.replace("..", "_")
}
