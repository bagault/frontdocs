use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct BuildResult {
    pub success: bool,
    pub output_path: String,
    pub stdout: String,
    pub stderr: String,
}

/// Detect whether a folder is an mdBook project (has book.toml) or raw markdown.
#[tauri::command]
pub async fn detect_project_type(folder_path: String) -> Result<String, String> {
    let path = PathBuf::from(&folder_path);
    if path.join("book.toml").exists() {
        Ok("project".to_string())
    } else if has_markdown_files(&path) {
        Ok("markdown".to_string())
    } else {
        Ok("empty".to_string())
    }
}

/// Convert a raw markdown folder into an mdBook project structure.
/// Moves .md files into src/, creates book.toml and SUMMARY.md.
#[tauri::command]
pub async fn convert_to_project(folder_path: String, title: String) -> Result<(), String> {
    let root = PathBuf::from(&folder_path);
    let src_dir = root.join("src");

    // Create src/
    std::fs::create_dir_all(&src_dir).map_err(|e| e.to_string())?;

    // Move all .md files and subdirectories containing .md files into src/
    move_markdown_content(&root, &src_dir)?;

    // Write book.toml
    let book_toml = format!(
        r#"[book]
title = "{title}"
language = "en"

[build]
build-dir = "dist"

[output.html]
default-theme = "navy"
preferred-dark-theme = "navy"
git-repository-url = ""
additional-css = []
"#
    );
    std::fs::write(root.join("book.toml"), book_toml).map_err(|e| e.to_string())?;

    // Generate SUMMARY.md
    generate_summary(&src_dir)?;

    Ok(())
}

/// Build the mdBook site from project or markdown sources.
#[tauri::command]
pub async fn build_site(
    app_handle: tauri::AppHandle,
    source_folder: String,
    output_folder: String,
) -> Result<BuildResult, String> {
    let source = PathBuf::from(&source_folder);

    if !source.exists() {
        return Err("Source folder does not exist".to_string());
    }

    let is_project = source.join("book.toml").exists();

    if is_project {
        // Build directly from project folder
        build_mdbook_project(&app_handle, &source, &PathBuf::from(&output_folder)).await
    } else {
        // Raw markdown folder — create temp mdBook project
        build_from_raw_markdown(&app_handle, &source, &PathBuf::from(&output_folder)).await
    }
}

#[tauri::command]
pub async fn preview_site(
    app_handle: tauri::AppHandle,
    source_folder: String,
) -> Result<BuildResult, String> {
    let temp_output = std::env::temp_dir().join("frontdocs_preview");
    build_site(
        app_handle,
        source_folder,
        temp_output.to_string_lossy().to_string(),
    )
    .await
}

/// Build from an existing mdBook project (has book.toml + src/)
async fn build_mdbook_project(
    app_handle: &tauri::AppHandle,
    project_dir: &PathBuf,
    output_dir: &PathBuf,
) -> Result<BuildResult, String> {
    // Temporarily override build-dir in a copy
    let build_dir = std::env::temp_dir().join("frontdocs_build");
    if build_dir.exists() {
        std::fs::remove_dir_all(&build_dir).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(project_dir, &build_dir)?;

    // Patch book.toml to set the output directory
    patch_book_toml(&build_dir, output_dir)?;

    let result = run_mdbook(app_handle, &build_dir).await?;

    // Clean up
    let _ = std::fs::remove_dir_all(&build_dir);

    Ok(result)
}

/// Build from a raw markdown folder (no book.toml)
async fn build_from_raw_markdown(
    app_handle: &tauri::AppHandle,
    source: &PathBuf,
    output_dir: &PathBuf,
) -> Result<BuildResult, String> {
    let build_dir = std::env::temp_dir().join("frontdocs_build");
    if build_dir.exists() {
        std::fs::remove_dir_all(&build_dir).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&build_dir).map_err(|e| e.to_string())?;

    // Create book.toml
    let title = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let title = capitalize_words(&title.replace('-', " ").replace('_', " "));

    let book_toml = format!(
        r#"[book]
title = "{title}"
language = "en"

[build]
build-dir = "{}"

[output.html]
default-theme = "navy"
preferred-dark-theme = "navy"
"#,
        output_dir.to_string_lossy().replace('\\', "/")
    );
    std::fs::write(build_dir.join("book.toml"), book_toml).map_err(|e| e.to_string())?;

    // Copy markdown content into src/
    let src_dir = build_dir.join("src");
    std::fs::create_dir_all(&src_dir).map_err(|e| e.to_string())?;
    copy_markdown_content(source, &src_dir)?;

    // Generate SUMMARY.md
    generate_summary(&src_dir)?;

    let result = run_mdbook(app_handle, &build_dir).await?;

    // Clean up
    let _ = std::fs::remove_dir_all(&build_dir);

    Ok(result)
}

/// Patch book.toml to set build-dir to the desired output directory
fn patch_book_toml(project_dir: &PathBuf, output_dir: &PathBuf) -> Result<(), String> {
    let toml_path = project_dir.join("book.toml");
    let content = std::fs::read_to_string(&toml_path).map_err(|e| e.to_string())?;

    let output_str = output_dir.to_string_lossy().replace('\\', "/");

    // Replace or add build-dir
    let re = regex::Regex::new(r#"(?m)^build-dir\s*=\s*"[^"]*""#).map_err(|e| e.to_string())?;
    let new_content = if re.is_match(&content) {
        re.replace(&content, &format!(r#"build-dir = "{}""#, output_str))
            .to_string()
    } else if content.contains("[build]") {
        content.replace(
            "[build]",
            &format!("[build]\nbuild-dir = \"{}\"", output_str),
        )
    } else {
        format!("{}\n[build]\nbuild-dir = \"{}\"\n", content, output_str)
    };

    std::fs::write(&toml_path, new_content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Auto-generate SUMMARY.md from the src/ directory structure.
/// Produces a nested chapter list that mdBook uses for navigation.
pub fn generate_summary(src_dir: &PathBuf) -> Result<(), String> {
    let mut lines = vec!["# Summary\n".to_string()];

    // Check for README.md or index.md as the introduction
    if src_dir.join("README.md").exists() {
        lines.push("[Introduction](./README.md)".to_string());
    } else {
        // Create a minimal README.md
        std::fs::write(
            src_dir.join("README.md"),
            "# Introduction\n\nWelcome to this knowledge base.\n",
        )
        .map_err(|e| e.to_string())?;
        lines.push("[Introduction](./README.md)".to_string());
    }

    lines.push(String::new());

    // Collect entries
    build_summary_entries(src_dir, src_dir, &mut lines, 0)?;

    std::fs::write(src_dir.join("SUMMARY.md"), lines.join("\n")).map_err(|e| e.to_string())?;
    Ok(())
}

fn build_summary_entries(
    base: &PathBuf,
    dir: &PathBuf,
    lines: &mut Vec<String>,
    depth: usize,
) -> Result<(), String> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();

    // Sort: directories first, then files, alphabetically
    entries.sort_by(|a, b| {
        let a_dir = a.path().is_dir();
        let b_dir = b.path().is_dir();
        match (a_dir, b_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    let indent = "  ".repeat(depth);

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip SUMMARY.md itself and hidden files
        if name == "SUMMARY.md" || name == "README.md" || name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            // Check if directory has an index file (README.md)
            let dir_index = path.join("README.md");
            let relative = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            let title = capitalize_words(&name.replace('-', " ").replace('_', " "));

            if dir_index.exists() {
                lines.push(format!(
                    "{indent}- [{}](./{}/README.md)",
                    title, relative
                ));
            } else {
                // Create a README.md for the section
                std::fs::write(
                    &dir_index,
                    format!("# {}\n", title),
                )
                .map_err(|e| e.to_string())?;
                lines.push(format!(
                    "{indent}- [{}](./{}/README.md)",
                    title, relative
                ));
            }

            // Recurse into subdirectory
            build_summary_entries(base, &path, lines, depth + 1)?;
        } else if path
            .extension()
            .map_or(false, |ext| ext == "md" || ext == "markdown")
        {
            let relative = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            // Extract title from first # heading or filename
            let title = extract_title(&path).unwrap_or_else(|| {
                capitalize_words(
                    &name
                        .trim_end_matches(".md")
                        .trim_end_matches(".markdown")
                        .replace('-', " ")
                        .replace('_', " "),
                )
            });

            lines.push(format!("{indent}- [{}](./{})", title, relative));
        }
    }

    Ok(())
}

/// Extract the first `# Heading` from a markdown file
fn extract_title(path: &PathBuf) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;

    // Skip frontmatter
    let body = strip_frontmatter(&content);

    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("# ") {
            let title = heading.trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }
    None
}

/// Strip YAML (---) or TOML (+++) frontmatter from content
fn strip_frontmatter(content: &str) -> &str {
    let trimmed = content.trim_start();
    if trimmed.starts_with("---") {
        if let Some(end) = trimmed[3..].find("---") {
            return &trimmed[3 + end + 3..];
        }
    }
    if trimmed.starts_with("+++") {
        if let Some(end) = trimmed[3..].find("+++") {
            return &trimmed[3 + end + 3..];
        }
    }
    content
}

fn capitalize_words(s: &str) -> String {
    s.split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().to_string() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn has_markdown_files(dir: &PathBuf) -> bool {
    walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .any(|e| {
            e.file_type().is_file()
                && e.path()
                    .extension()
                    .map_or(false, |ext| ext == "md" || ext == "markdown")
        })
}

/// Move .md files and directories containing .md files from root into src_dir.
/// Preserves directory structure. Skips book.toml, src/, dist/.
fn move_markdown_content(root: &PathBuf, src_dir: &PathBuf) -> Result<(), String> {
    for entry in std::fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip special dirs/files
        if name == "src" || name == "dist" || name == "book.toml" || name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            // Check if directory contains markdown
            if has_markdown_files(&path) {
                let dest = src_dir.join(&name);
                std::fs::rename(&path, &dest).map_err(|e| {
                    // Fall back to copy+delete if rename fails (cross-device)
                    if let Err(copy_err) = copy_dir_recursive(&path, &dest) {
                        return format!("Move failed: {} (copy fallback: {})", e, copy_err);
                    }
                    if let Err(rm_err) = std::fs::remove_dir_all(&path) {
                        return format!("Move partial — delete failed: {}", rm_err);
                    }
                    String::new()
                }).or_else(|e| if e.is_empty() { Ok(()) } else { Err(e) })?;
            }
        } else if path
            .extension()
            .map_or(false, |ext| ext == "md" || ext == "markdown")
        {
            let dest = src_dir.join(&name);
            std::fs::rename(&path, &dest).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Copy markdown content preserving structure (for raw→temp build)
fn copy_markdown_content(source: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    for entry in walkdir::WalkDir::new(source)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let relative = entry.path().strip_prefix(source).unwrap_or(entry.path());

        if entry.file_type().is_dir() {
            std::fs::create_dir_all(dest.join(relative)).map_err(|e| e.to_string())?;
        } else if entry
            .path()
            .extension()
            .map_or(false, |ext| ext == "md" || ext == "markdown")
        {
            let content = std::fs::read_to_string(entry.path()).map_err(|e| e.to_string())?;
            // Strip TOML/YAML frontmatter — mdBook doesn't use it
            let body = strip_frontmatter(&content).trim_start().to_string();
            let dest_file = dest.join(relative);
            if let Some(parent) = dest_file.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::write(&dest_file, body).map_err(|e| e.to_string())?;
        } else if entry
            .path()
            .extension()
            .map_or(false, |ext| {
                ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "gif"
                    || ext == "svg" || ext == "webp" || ext == "bib"
            })
        {
            // Copy images and bibliography files
            let dest_file = dest.join(relative);
            if let Some(parent) = dest_file.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::copy(entry.path(), &dest_file).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
    {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

async fn run_mdbook(
    app_handle: &tauri::AppHandle,
    project_dir: &PathBuf,
) -> Result<BuildResult, String> {
    use tokio::process::Command;

    let mdbook_path = find_mdbook(app_handle);

    let child = Command::new(&mdbook_path)
        .arg("build")
        .arg(project_dir.to_string_lossy().as_ref())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to run mdBook: {}. Make sure mdBook is installed or the sidecar binary is available.",
                e
            )
        })?;

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        child.wait_with_output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
            let output_path = find_build_output(app_handle, project_dir);

            Ok(BuildResult {
                success: output.status.success(),
                output_path,
                stdout: stdout_str,
                stderr: stderr_str,
            })
        }
        Ok(Err(e)) => Err(format!("mdBook process error: {}", e)),
        Err(_) => Err("mdBook build timed out after 120 seconds.".to_string()),
    }
}

/// Find the actual build output directory from the project's book.toml
fn find_build_output(_app_handle: &tauri::AppHandle, project_dir: &PathBuf) -> String {
    let toml_path = project_dir.join("book.toml");
    if let Ok(content) = std::fs::read_to_string(&toml_path) {
        // Extract build-dir value
        let re = regex::Regex::new(r#"build-dir\s*=\s*"([^"]*)""#).ok();
        if let Some(re) = re {
            if let Some(caps) = re.captures(&content) {
                let build_dir = &caps[1];
                let html_dir = PathBuf::from(build_dir).join("html");
                if html_dir.exists() {
                    return html_dir.to_string_lossy().to_string();
                }
                // Also try absolute
                let abs = PathBuf::from(build_dir);
                let html_abs = abs.join("html");
                if html_abs.exists() {
                    return html_abs.to_string_lossy().to_string();
                }
                return build_dir.to_string();
            }
        }
    }
    // Default: book/ in project dir
    project_dir
        .join("book")
        .join("html")
        .to_string_lossy()
        .to_string()
}

fn find_mdbook(app_handle: &tauri::AppHandle) -> String {
    use tauri::Manager;

    // Try sidecar in resource dir
    let resource_dir = app_handle.path().resource_dir().ok();
    if let Some(dir) = resource_dir {
        let sidecar = dir.join("binaries").join("mdbook");
        if is_real_binary(&sidecar) {
            return sidecar.to_string_lossy().to_string();
        }
        let sidecar_exe = dir.join("binaries").join("mdbook.exe");
        if is_real_binary(&sidecar_exe) {
            return sidecar_exe.to_string_lossy().to_string();
        }
    }

    // Try development sidecar — try common triples
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let triples = [
        "x86_64-unknown-linux-gnu",
        "aarch64-unknown-linux-gnu",
        "x86_64-apple-darwin",
        "aarch64-apple-darwin",
        "x86_64-pc-windows-msvc",
    ];
    for triple in &triples {
        let dev_sidecar = manifest_dir.join("binaries").join(format!("mdbook-{}", triple));
        if is_real_binary(&dev_sidecar) {
            return dev_sidecar.to_string_lossy().to_string();
        }
        // Also check .exe variant
        let dev_sidecar_exe = manifest_dir.join("binaries").join(format!("mdbook-{}.exe", triple));
        if is_real_binary(&dev_sidecar_exe) {
            return dev_sidecar_exe.to_string_lossy().to_string();
        }
    }

    // Fall back to system mdbook
    "mdbook".to_string()
}

fn is_real_binary(path: &std::path::Path) -> bool {
    if !path.exists() {
        return false;
    }
    if let Ok(bytes) = std::fs::read(path) {
        if bytes.len() >= 4 {
            // ELF
            if bytes[0] == 0x7f && bytes[1] == b'E' && bytes[2] == b'L' && bytes[3] == b'F' {
                return true;
            }
            // PE
            if bytes[0] == b'M' && bytes[1] == b'Z' {
                return true;
            }
            // Mach-O
            if (bytes[0] == 0xFE && bytes[1] == 0xED && bytes[2] == 0xFA)
                || (bytes[0] == 0xCF && bytes[1] == 0xFA && bytes[2] == 0xED)
            {
                return true;
            }
        }
    }
    false
}
