use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct BuildResult {
    pub success: bool,
    pub output_path: String,
    pub stdout: String,
    pub stderr: String,
}

/// Detect whether a folder is an mkdocs project (has mkdocs.yml) or raw markdown.
#[tauri::command]
pub async fn detect_project_type(folder_path: String) -> Result<String, String> {
    let path = PathBuf::from(&folder_path);
    if path.join("mkdocs.yml").exists() {
        Ok("project".to_string())
    } else if has_markdown_files(&path) {
        Ok("markdown".to_string())
    } else {
        Ok("empty".to_string())
    }
}

/// Convert a raw markdown folder into an mkdocs project structure.
/// Moves .md files into src/, creates mkdocs.yml with nav.
#[tauri::command]
pub async fn convert_to_project(folder_path: String, title: String) -> Result<(), String> {
    let root = PathBuf::from(&folder_path);
    let src_dir = root.join("src");

    // Create src/
    std::fs::create_dir_all(&src_dir).map_err(|e| e.to_string())?;

    // Create extensions/ directory for third-party mkdocs extensions
    let ext_dir = root.join("extensions");
    std::fs::create_dir_all(&ext_dir).map_err(|e| e.to_string())?;
    // Create a placeholder README in extensions/
    std::fs::write(
        ext_dir.join("README.md"),
        "# MkDocs Extensions\n\nPlace third-party MkDocs extensions (Python packages) in this directory.\n\
         They will be added to `sys.path` automatically when building.\n\n\
         Example: copy a custom extension folder here, then reference it in `mkdocs.yml` under `markdown_extensions` or `plugins`.\n",
    )
    .map_err(|e| e.to_string())?;

    // Move all .md files and subdirectories containing .md files into src/
    move_markdown_content(&root, &src_dir)?;

    // Ensure index.md exists (mkdocs requires it)
    ensure_index_md(&src_dir)?;

    // Build nav structure
    let nav = build_nav_entries(&src_dir, &src_dir)?;
    let nav_yaml = format_nav_yaml(&nav, 2);

    // Write mkdocs.yml
    let mkdocs_yml = format!(
        r#"site_name: "{title}"
docs_dir: src
site_dir: dist

theme:
  name: material
  palette:
    scheme: slate
    primary: indigo
    accent: indigo

nav:
  - "Home": "index.md"
{nav_yaml}

markdown_extensions:
  - toc:
      permalink: true
  - tables
  - attr_list
  - def_list
  - admonition
  - pymdownx.highlight
  - pymdownx.superfences
  - pymdownx.arithmatex:
      generic: true

extra_javascript:
  - https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js
  - https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js

extra_css:
  - https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css
"#
    );
    std::fs::write(root.join("mkdocs.yml"), mkdocs_yml).map_err(|e| e.to_string())?;

    Ok(())
}

/// Build the mkdocs site from project or markdown sources.
#[tauri::command]
pub async fn build_site(
    source_folder: String,
    output_folder: String,
) -> Result<BuildResult, String> {
    let source = PathBuf::from(&source_folder);

    if !source.exists() {
        return Err("Source folder does not exist".to_string());
    }

    let is_project = source.join("mkdocs.yml").exists();

    if is_project {
        build_mkdocs_project(&source, &PathBuf::from(&output_folder)).await
    } else {
        build_from_raw_markdown(&source, &PathBuf::from(&output_folder)).await
    }
}

#[tauri::command]
pub async fn preview_site(source_folder: String) -> Result<BuildResult, String> {
    let temp_output = std::env::temp_dir().join("frontdocs_preview");
    build_site(
        source_folder,
        temp_output.to_string_lossy().to_string(),
    )
    .await
}

/// Build from an existing mkdocs project (has mkdocs.yml + src/)
async fn build_mkdocs_project(
    project_dir: &PathBuf,
    output_dir: &PathBuf,
) -> Result<BuildResult, String> {
    // Copy project to temp dir so we can patch site_dir without modifying original
    let build_dir = std::env::temp_dir().join("frontdocs_build");
    if build_dir.exists() {
        std::fs::remove_dir_all(&build_dir).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(project_dir, &build_dir)?;

    // Patch mkdocs.yml to set site_dir to the desired output
    patch_mkdocs_yml(&build_dir, output_dir)?;

    // Add extensions/ to PYTHONPATH if it exists
    let extensions_dir = build_dir.join("extensions");
    let extra_python_path = if extensions_dir.exists() && extensions_dir.is_dir() {
        Some(extensions_dir)
    } else {
        None
    };

    let result = run_mkdocs(&build_dir, extra_python_path.as_ref()).await?;

    // Clean up temp build dir
    let _ = std::fs::remove_dir_all(&build_dir);

    Ok(result)
}

/// Build from a raw markdown folder (no mkdocs.yml)
async fn build_from_raw_markdown(
    source: &PathBuf,
    output_dir: &PathBuf,
) -> Result<BuildResult, String> {
    let build_dir = std::env::temp_dir().join("frontdocs_build");
    if build_dir.exists() {
        std::fs::remove_dir_all(&build_dir).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&build_dir).map_err(|e| e.to_string())?;

    // Determine title from folder name
    let title = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let title = capitalize_words(&title.replace('-', " ").replace('_', " "));

    // Copy markdown content into src/
    let src_dir = build_dir.join("src");
    std::fs::create_dir_all(&src_dir).map_err(|e| e.to_string())?;
    copy_markdown_content(source, &src_dir)?;

    // Ensure index.md
    ensure_index_md(&src_dir)?;

    // Build nav
    let nav = build_nav_entries(&src_dir, &src_dir)?;
    let nav_yaml = format_nav_yaml(&nav, 2);

    let output_str = normalize_path(&output_dir.to_string_lossy());

    let mkdocs_yml = format!(
        r#"site_name: "{title}"
docs_dir: src
site_dir: "{output_str}"

theme:
  name: material
  palette:
    scheme: slate
    primary: indigo
    accent: indigo

nav:
  - "Home": "index.md"
{nav_yaml}

markdown_extensions:
  - toc:
      permalink: true
  - tables
  - attr_list
  - def_list
  - admonition
  - pymdownx.highlight
  - pymdownx.superfences
  - pymdownx.arithmatex:
      generic: true

extra_javascript:
  - https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js
  - https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js

extra_css:
  - https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css
"#
    );
    std::fs::write(build_dir.join("mkdocs.yml"), mkdocs_yml).map_err(|e| e.to_string())?;

    let result = run_mkdocs(&build_dir, None).await?;

    // Clean up
    let _ = std::fs::remove_dir_all(&build_dir);

    Ok(result)
}

/// Patch mkdocs.yml to set site_dir to the desired output directory
fn patch_mkdocs_yml(project_dir: &PathBuf, output_dir: &PathBuf) -> Result<(), String> {
    let yml_path = project_dir.join("mkdocs.yml");
    let content = std::fs::read_to_string(&yml_path).map_err(|e| e.to_string())?;

    let output_str = normalize_path(&output_dir.to_string_lossy());

    let mut new_lines = Vec::new();
    let mut found_site_dir = false;
    for line in content.lines() {
        if line.starts_with("site_dir:") || line.starts_with("site_dir :") {
            new_lines.push(format!("site_dir: \"{}\"", output_str));
            found_site_dir = true;
        } else {
            new_lines.push(line.to_string());
        }
    }
    if !found_site_dir {
        // Insert after site_name or at the top
        new_lines.insert(1, format!("site_dir: \"{}\"", output_str));
    }

    std::fs::write(&yml_path, new_lines.join("\n")).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Nav generation ──────────────────────────────────────────────────────────

#[derive(Debug)]
enum NavEntry {
    Page { title: String, path: String },
    Section { title: String, children: Vec<NavEntry> },
}

fn build_nav_entries(base: &Path, dir: &Path) -> Result<Vec<NavEntry>, String> {
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

    let mut nav = Vec::new();

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and index.md at current level
        if name.starts_with('.') || name == "index.md" {
            continue;
        }

        if path.is_dir() {
            let title = capitalize_words(&name.replace('-', " ").replace('_', " "));
            let children = build_nav_entries(base, &path)?;

            // Check for index.md in the directory
            let dir_index = path.join("index.md");
            if !dir_index.exists() {
                // Create an index.md for the section
                std::fs::write(
                    &dir_index,
                    format!("# {}\n", title),
                )
                .map_err(|e| e.to_string())?;
            }

            let mut section_children = Vec::new();
            let relative = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            let relative = normalize_path(&relative);
            section_children.push(NavEntry::Page {
                title: "Overview".to_string(),
                path: format!("{}/index.md", relative),
            });
            section_children.extend(children);

            nav.push(NavEntry::Section {
                title,
                children: section_children,
            });
        } else if path
            .extension()
            .map_or(false, |ext| ext == "md" || ext == "markdown")
        {
            let relative = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            let relative = normalize_path(&relative);

            let title = extract_title(&path).unwrap_or_else(|| {
                capitalize_words(
                    &name
                        .trim_end_matches(".md")
                        .trim_end_matches(".markdown")
                        .replace('-', " ")
                        .replace('_', " "),
                )
            });

            nav.push(NavEntry::Page {
                title,
                path: relative,
            });
        }
    }

    Ok(nav)
}

fn format_nav_yaml(entries: &[NavEntry], indent: usize) -> String {
    let mut lines = Vec::new();
    let prefix = " ".repeat(indent);

    for entry in entries {
        match entry {
            NavEntry::Page { title, path } => {
                lines.push(format!("{}- \"{}\": \"{}\"", prefix, title, path));
            }
            NavEntry::Section { title, children } => {
                lines.push(format!("{}- \"{}\":", prefix, title));
                let child_yaml = format_nav_yaml(children, indent + 4);
                lines.push(child_yaml);
            }
        }
    }

    lines.join("\n")
}

/// Ensure index.md exists (mkdocs requires it as the homepage)
fn ensure_index_md(src_dir: &Path) -> Result<(), String> {
    let index = src_dir.join("index.md");
    if index.exists() {
        return Ok(());
    }

    // Check if there's a README.md we can rename
    let readme = src_dir.join("README.md");
    if readme.exists() {
        std::fs::rename(&readme, &index).map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Create a minimal index.md
    std::fs::write(
        &index,
        "# Welcome\n\nWelcome to this knowledge base.\n",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Extract the first `# Heading` from a markdown file
fn extract_title(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
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

fn has_markdown_files(dir: &Path) -> bool {
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

/// Normalize a path string for cross-platform compatibility.
/// Converts backslashes to forward slashes (for YAML, URLs, etc.)
fn normalize_path(p: &str) -> String {
    p.replace('\\', "/")
}

/// Move .md files and directories containing .md files from root into src_dir.
/// Preserves directory structure. Skips mkdocs.yml, src/, dist/, extensions/.
fn move_markdown_content(root: &Path, src_dir: &Path) -> Result<(), String> {
    for entry in std::fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip special dirs/files
        if name == "src"
            || name == "dist"
            || name == "extensions"
            || name == "mkdocs.yml"
            || name.starts_with('.')
        {
            continue;
        }

        if path.is_dir() {
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
                })
                .or_else(|e| if e.is_empty() { Ok(()) } else { Err(e) })?;
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
fn copy_markdown_content(source: &Path, dest: &Path) -> Result<(), String> {
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
            // Strip TOML/YAML frontmatter — mkdocs doesn't need it for build either
            let body = strip_frontmatter(&content).trim_start().to_string();
            let dest_file = dest.join(relative);
            if let Some(parent) = dest_file.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::write(&dest_file, body).map_err(|e| e.to_string())?;
        } else if entry.path().extension().map_or(false, |ext| {
            ext == "png"
                || ext == "jpg"
                || ext == "jpeg"
                || ext == "gif"
                || ext == "svg"
                || ext == "webp"
                || ext == "bib"
                || ext == "css"
        }) {
            // Copy images, bibliography files, and CSS
            let dest_file = dest.join(relative);
            if let Some(parent) = dest_file.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::copy(entry.path(), &dest_file).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
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

async fn run_mkdocs(
    project_dir: &Path,
    extra_python_path: Option<&PathBuf>,
) -> Result<BuildResult, String> {
    use tokio::process::Command;

    let mkdocs_cmd = find_mkdocs();

    let mut cmd = Command::new(&mkdocs_cmd);
    cmd.arg("build")
        .current_dir(project_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Add extensions/ dir to PYTHONPATH so custom extensions are discoverable
    if let Some(ext_dir) = extra_python_path {
        let ext_str = ext_dir.to_string_lossy().to_string();
        let current_pythonpath = std::env::var("PYTHONPATH").unwrap_or_default();
        let sep = if cfg!(windows) { ";" } else { ":" };
        let new_pythonpath = if current_pythonpath.is_empty() {
            ext_str
        } else {
            format!("{}{}{}", ext_str, sep, current_pythonpath)
        };
        cmd.env("PYTHONPATH", new_pythonpath);
    }

    let child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to run mkdocs: {}. Make sure mkdocs is installed (pip install mkdocs mkdocs-material).",
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

            // mkdocs outputs to site_dir as configured in mkdocs.yml
            let output_path = find_build_output(project_dir);

            Ok(BuildResult {
                success: output.status.success(),
                output_path,
                stdout: stdout_str,
                stderr: stderr_str,
            })
        }
        Ok(Err(e)) => Err(format!("mkdocs process error: {}", e)),
        Err(_) => Err("mkdocs build timed out after 120 seconds.".to_string()),
    }
}

/// Find the actual build output directory from the project's mkdocs.yml
fn find_build_output(project_dir: &Path) -> String {
    let yml_path = project_dir.join("mkdocs.yml");
    if let Ok(content) = std::fs::read_to_string(&yml_path) {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("site_dir:") {
                let value = trimmed
                    .strip_prefix("site_dir:")
                    .unwrap_or("")
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'');
                if !value.is_empty() {
                    let site_dir = PathBuf::from(value);
                    if site_dir.is_absolute() {
                        return site_dir.to_string_lossy().to_string();
                    } else {
                        return project_dir
                            .join(site_dir)
                            .to_string_lossy()
                            .to_string();
                    }
                }
            }
        }
    }
    // Default
    project_dir.join("site").to_string_lossy().to_string()
}

fn find_mkdocs() -> String {
    // Try common mkdocs locations
    let candidates: Vec<&str> = if cfg!(windows) {
        vec!["mkdocs.exe", "mkdocs"]
    } else {
        vec!["mkdocs", "/usr/local/bin/mkdocs", "/usr/bin/mkdocs"]
    };

    for candidate in &candidates {
        let path = Path::new(candidate);
        if path.exists() {
            return candidate.to_string();
        }
    }

    // Check if mkdocs is on PATH using `which` or `where`
    let which_cmd = if cfg!(windows) { "where" } else { "which" };
    if let Ok(output) = std::process::Command::new(which_cmd)
        .arg("mkdocs")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                // Take first line in case `where` returns multiple paths on Windows
                return path.lines().next().unwrap_or(&path).to_string();
            }
        }
    }

    // Fall back — let the OS find it
    "mkdocs".to_string()
}
