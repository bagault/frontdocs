use std::io::Write;
use std::path::PathBuf;
use walkdir::WalkDir;

#[tauri::command]
pub async fn export_site(
    source_path: String,
    output_format: String,
    output_path: Option<String>,
) -> Result<String, String> {
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err("Built site does not exist. Please build first.".to_string());
    }

    match output_format.as_str() {
        "folder" => export_as_folder(&source, output_path),
        "archive" => export_as_archive(&source, output_path),
        _ => Err(format!("Unknown output format: {}", output_format)),
    }
}

fn export_as_folder(source: &PathBuf, output_path: Option<String>) -> Result<String, String> {
    let dest = if let Some(path) = output_path {
        PathBuf::from(path)
    } else {
        source
            .parent()
            .unwrap_or(source)
            .join("frontdocs_output")
    };

    if dest.exists() {
        std::fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(source, &dest)?;

    Ok(dest.to_string_lossy().to_string())
}

fn export_as_archive(source: &PathBuf, output_path: Option<String>) -> Result<String, String> {
    let archive_path = if let Some(path) = output_path {
        let p = PathBuf::from(&path);
        if p.extension().map_or(true, |ext| ext != "zip") {
            p.join("frontdocs_output.zip")
        } else {
            p
        }
    } else {
        source
            .parent()
            .unwrap_or(source)
            .join("frontdocs_output.zip")
    };

    if let Some(parent) = archive_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let file = std::fs::File::create(&archive_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for entry in WalkDir::new(source)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let relative = entry
            .path()
            .strip_prefix(source)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .replace('\\', "/");  // ZIP entries must use forward slashes

        zip.start_file(&relative, options)
            .map_err(|e| e.to_string())?;

        let content = std::fs::read(entry.path()).map_err(|e| e.to_string())?;
        zip.write_all(&content).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(archive_path.to_string_lossy().to_string())
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

#[tauri::command]
pub async fn remove_dir(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() && p.is_dir() {
        std::fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}
