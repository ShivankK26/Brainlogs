//! §14: the capture engine must never persist a bitmap. Screenshots exist only as in-memory
//! buffers on the Windows OCR path. This test scans the crate's own sources for image encoders
//! and image file writes so a future change cannot slip one in unnoticed.
#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    /// Always forbidden: disk-oriented image APIs and image file names.
    const FORBIDDEN: &[&str] = &[
        ".save(",
        "save_with_format(",
        "ImageEncoder",
        "PngEncoder",
        "JpegEncoder",
        ".png\"",
        ".jpg\"",
        ".jpeg\"",
        ".bmp\"",
        ".webp\"",
    ];
    /// `write_to(` is allowed only into an in-memory `Cursor` created within the previous few lines.
    const LOOKBACK: usize = 6;

    #[test]
    fn engine_sources_never_write_images() {
        let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut offenders = Vec::new();
        for entry in fs::read_dir(&src).expect("src dir") {
            let path = entry.expect("entry").path();
            if path.extension().and_then(|e| e.to_str()) != Some("rs") {
                continue;
            }
            if path.file_name().and_then(|n| n.to_str()) == Some("no_images_test.rs") {
                continue;
            }
            let text = fs::read_to_string(&path).expect("read source");
            let lines: Vec<&str> = text.lines().collect();
            for (i, line) in lines.iter().enumerate() {
                let code = line.split("//").next().unwrap_or("");
                for needle in FORBIDDEN {
                    if code.contains(needle) {
                        offenders.push(format!("{}:{} {}", path.display(), i + 1, needle));
                    }
                }
                if code.contains("write_to(") {
                    let start = i.saturating_sub(LOOKBACK);
                    let in_memory = lines[start..=i].iter().any(|l| l.contains("Cursor::new"));
                    if !in_memory {
                        offenders.push(format!("{}:{} write_to( outside an in-memory Cursor", path.display(), i + 1));
                    }
                }
            }
        }
        assert!(offenders.is_empty(), "image write found in capture engine:\n{}", offenders.join("\n"));
    }
}
