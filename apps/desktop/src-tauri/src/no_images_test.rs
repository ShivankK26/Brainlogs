//! §14: the capture engine must never persist a bitmap. Screenshots exist only as in-memory
//! buffers on the Windows OCR path. This test scans the crate's own sources for image encoders
//! and image file writes so a future change cannot slip one in unnoticed.
#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    const FORBIDDEN: &[&str] = &[
        ".save(",
        "save_with_format(",
        "write_to(",
        "ImageEncoder",
        "PngEncoder",
        "JpegEncoder",
        ".png\"",
        ".jpg\"",
        ".jpeg\"",
        ".bmp\"",
    ];

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
            for (i, line) in text.lines().enumerate() {
                let code = line.split("//").next().unwrap_or("");
                for needle in FORBIDDEN {
                    if code.contains(needle) {
                        offenders.push(format!("{}:{} {}", path.display(), i + 1, needle));
                    }
                }
            }
        }
        assert!(offenders.is_empty(), "image write found in capture engine:\n{}", offenders.join("\n"));
    }
}
