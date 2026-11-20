//! Bridge to the Python document-extraction sidecar, plus input path expansion.
//!
//! Sidecar resolution order:
//! 1. `MUSUBITE_SIDECAR` environment variable (path to an executable)
//! 2. A bundled `musubite-parser` binary next to the app executable (PyInstaller build)
//! 3. Development fallback: `uv run --project <repo>/sidecar python parser.py`

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const SUPPORTED_EXTENSIONS: &[&str] = &["pptx", "pdf", "md", "markdown", "txt", "csv"];
const BUNDLED_BINARY: &str = "musubite-parser";
const ENV_OVERRIDE: &str = "MUSUBITE_SIDECAR";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Section {
    pub index: u32,
    pub heading: Option<String>,
    pub body: String,
    pub notes: Option<String>,
    pub low_text: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParsedDocument {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub page_count: Option<u32>,
    pub sections: Vec<Section>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParseResult {
    pub documents: Vec<ParsedDocument>,
}

#[derive(Debug, thiserror::Error)]
pub enum ParserError {
    #[error("パーサーが見つかりません。開発時は `uv` をインストールし sidecar で `uv sync` を実行してください")]
    SidecarNotFound,
    #[error("パーサーの起動に失敗しました: {0}")]
    Spawn(#[from] std::io::Error),
    #[error("パーサーがエラー終了しました (code {code:?}): {stderr}")]
    Failed { code: Option<i32>, stderr: String },
    #[error("パーサーの出力を読み取れませんでした: {0}")]
    InvalidOutput(#[from] serde_json::Error),
}

/// A resolved way to invoke the sidecar: `program [prefix_args...] <files...>`.
#[derive(Debug, Clone, PartialEq)]
pub struct SidecarCommand {
    pub program: PathBuf,
    pub prefix_args: Vec<OsString>,
}

impl SidecarCommand {
    pub fn new(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
            prefix_args: Vec::new(),
        }
    }

    /// Run the sidecar on `paths` and decode its JSON output.
    pub fn parse(&self, paths: &[String]) -> Result<ParseResult, ParserError> {
        let output = Command::new(&self.program)
            .args(&self.prefix_args)
            .args(paths)
            .env("PYTHONIOENCODING", "utf-8")
            .output()?;
        if !output.status.success() {
            return Err(ParserError::Failed {
                code: output.status.code(),
                stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
            });
        }
        Ok(serde_json::from_slice(&output.stdout)?)
    }
}

/// Locate `uv` even when the app is launched from Finder with a minimal PATH.
fn find_uv() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).map(|d| d.join("uv")).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        candidates.push(home.join(".local/bin/uv"));
        candidates.push(home.join(".cargo/bin/uv"));
    }
    candidates.push(PathBuf::from("/opt/homebrew/bin/uv"));
    candidates.push(PathBuf::from("/usr/local/bin/uv"));
    candidates.into_iter().find(|p| p.is_file())
}

/// Resolve the sidecar command given the environment override, app executable and dev sidecar dir.
pub fn resolve_sidecar_with(
    env_override: Option<PathBuf>,
    exe_dir: Option<&Path>,
    dev_sidecar_dir: &Path,
    uv: Option<PathBuf>,
) -> Result<SidecarCommand, ParserError> {
    if let Some(path) = env_override.filter(|p| p.is_file()) {
        return Ok(SidecarCommand::new(path));
    }
    if let Some(bundled) = exe_dir
        .map(|d| d.join(BUNDLED_BINARY))
        .filter(|p| p.is_file())
    {
        return Ok(SidecarCommand::new(bundled));
    }
    let script = dev_sidecar_dir.join("parser.py");
    match uv {
        Some(uv) if script.is_file() => Ok(SidecarCommand {
            program: uv,
            prefix_args: vec![
                "run".into(),
                "--quiet".into(),
                "--project".into(),
                dev_sidecar_dir.into(),
                "python".into(),
                script.into(),
            ],
        }),
        _ => Err(ParserError::SidecarNotFound),
    }
}

pub fn resolve_sidecar() -> Result<SidecarCommand, ParserError> {
    let exe = std::env::current_exe().ok();
    let dev_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sidecar");
    resolve_sidecar_with(
        std::env::var_os(ENV_OVERRIDE).map(PathBuf::from),
        exe.as_deref().and_then(Path::parent),
        &dev_dir,
        find_uv(),
    )
}

// ------------------------------------------------------------------ path expansion

pub fn is_supported(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Hidden files and Office lock files (`~$deck.pptx`) are never useful input.
fn is_ignored(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.') || n.starts_with("~$"))
        .unwrap_or(true)
}

fn collect_dir(dir: &Path, recursive: bool, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut paths: Vec<PathBuf> = entries.filter_map(|e| e.ok().map(|e| e.path())).collect();
    paths.sort();
    for path in paths {
        if is_ignored(&path) {
            continue;
        }
        if path.is_dir() {
            if recursive {
                collect_dir(&path, recursive, out);
            }
        } else if is_supported(&path) {
            out.push(path);
        }
    }
}

/// Expand dropped/selected paths: files are kept if supported, directories are scanned
/// (recursively when `recursive`). Order is preserved and duplicates removed.
pub fn expand_paths(paths: &[String], recursive: bool) -> Vec<String> {
    let mut collected = Vec::new();
    for raw in paths {
        let path = PathBuf::from(raw);
        if path.is_dir() {
            collect_dir(&path, recursive, &mut collected);
        } else if path.is_file() && is_supported(&path) && !is_ignored(&path) {
            collected.push(path);
        }
    }
    let mut seen = HashSet::new();
    collected
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .filter(|p| seen.insert(p.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::TempDir;

    fn touch(dir: &Path, rel: &str) -> String {
        let path = dir.join(rel);
        fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        fs::write(&path, "x").expect("write");
        path.to_string_lossy().into_owned()
    }

    fn script(dir: &Path, body: &str) -> PathBuf {
        let path = dir.join("fake-parser.sh");
        fs::write(&path, format!("#!/bin/sh\n{body}\n")).expect("write");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).expect("chmod");
        path
    }

    #[test]
    fn supported_extensions_are_case_insensitive() {
        assert!(is_supported(Path::new("/a/B.PPTX")));
        assert!(is_supported(Path::new("/a/b.markdown")));
        assert!(!is_supported(Path::new("/a/b.png")));
        assert!(!is_supported(Path::new("/a/noext")));
    }

    #[test]
    fn expand_paths_scans_directories_and_filters() {
        let tmp = TempDir::new().expect("tmp");
        let d = tmp.path();
        let b = touch(d, "b.pdf");
        let a = touch(d, "a.pptx");
        touch(d, "image.png");
        touch(d, ".hidden.md");
        touch(d, "~$a.pptx");
        let nested = touch(d, "sub/c.md");
        touch(d, ".git/d.txt");
        let dir = d.to_string_lossy().into_owned();

        assert_eq!(
            expand_paths(std::slice::from_ref(&dir), false),
            vec![a.clone(), b.clone()]
        );
        assert_eq!(
            expand_paths(std::slice::from_ref(&dir), true),
            vec![a.clone(), b.clone(), nested]
        );
    }

    #[test]
    fn expand_paths_keeps_order_and_dedupes_files() {
        let tmp = TempDir::new().expect("tmp");
        let a = touch(tmp.path(), "a.txt");
        let b = touch(tmp.path(), "b.csv");
        let png = touch(tmp.path(), "c.png");
        let missing = tmp
            .path()
            .join("missing.pdf")
            .to_string_lossy()
            .into_owned();
        let input = vec![b.clone(), a.clone(), b.clone(), png, missing];
        assert_eq!(expand_paths(&input, true), vec![b, a]);
    }

    #[test]
    fn sidecar_parses_json_output() {
        let tmp = TempDir::new().expect("tmp");
        let json = r#"{"documents":[{"name":"a.md","path":"/a.md","type":"md","page_count":null,"sections":[{"index":1,"heading":null,"body":"本文","notes":null,"low_text":false}],"error":null}]}"#;
        let cmd = SidecarCommand::new(script(tmp.path(), &format!("echo '{json}'")));
        let result = cmd.parse(&["/a.md".into()]).expect("parse");
        assert_eq!(result.documents.len(), 1);
        assert_eq!(result.documents[0].doc_type, "md");
        assert_eq!(result.documents[0].sections[0].body, "本文");

        // Round-trip keeps the `type` key the frontend expects.
        let value = serde_json::to_value(&result).expect("serialize");
        assert_eq!(value["documents"][0]["type"], "md");
    }

    #[test]
    fn sidecar_receives_prefix_args_then_paths() {
        let tmp = TempDir::new().expect("tmp");
        let program = script(
            tmp.path(),
            r#"printf '{"documents":[{"name":"%s","path":"%s","type":"txt","page_count":null,"sections":[],"error":null}]}' "$1" "$2""#,
        );
        let cmd = SidecarCommand {
            program,
            prefix_args: vec!["PREFIX".into()],
        };
        let result = cmd.parse(&["/x.txt".into()]).expect("parse");
        assert_eq!(result.documents[0].name, "PREFIX");
        assert_eq!(result.documents[0].path, "/x.txt");
    }

    #[test]
    fn sidecar_failure_reports_stderr() {
        let tmp = TempDir::new().expect("tmp");
        let cmd = SidecarCommand::new(script(tmp.path(), "echo boom >&2; exit 3"));
        match cmd.parse(&[]) {
            Err(ParserError::Failed { code, stderr }) => {
                assert_eq!(code, Some(3));
                assert_eq!(stderr, "boom");
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn sidecar_invalid_json_and_missing_binary() {
        let tmp = TempDir::new().expect("tmp");
        let cmd = SidecarCommand::new(script(tmp.path(), "echo not-json"));
        assert!(matches!(cmd.parse(&[]), Err(ParserError::InvalidOutput(_))));

        let missing = SidecarCommand::new(tmp.path().join("nope"));
        assert!(matches!(missing.parse(&[]), Err(ParserError::Spawn(_))));
    }

    #[test]
    fn resolve_prefers_env_then_bundled_then_uv() {
        let tmp = TempDir::new().expect("tmp");
        let d = tmp.path();
        let env_bin = PathBuf::from(touch(d, "env/parser"));
        let exe_dir = d.join("MacOS");
        let bundled = PathBuf::from(touch(&exe_dir, BUNDLED_BINARY));
        let sidecar_dir = d.join("sidecar");
        touch(&sidecar_dir, "parser.py");
        let uv = PathBuf::from(touch(d, "bin/uv"));

        let r = resolve_sidecar_with(
            Some(env_bin.clone()),
            Some(&exe_dir),
            &sidecar_dir,
            Some(uv.clone()),
        );
        assert_eq!(r.expect("env").program, env_bin);

        let r = resolve_sidecar_with(
            Some(d.join("missing")),
            Some(&exe_dir),
            &sidecar_dir,
            Some(uv.clone()),
        );
        assert_eq!(r.expect("bundled").program, bundled);

        let r = resolve_sidecar_with(
            None,
            Some(&d.join("nowhere")),
            &sidecar_dir,
            Some(uv.clone()),
        )
        .expect("uv");
        assert_eq!(r.program, uv);
        assert_eq!(
            r.prefix_args
                .first()
                .map(|a| a.to_string_lossy().into_owned()),
            Some("run".into())
        );
        assert_eq!(
            r.prefix_args.last(),
            Some(&sidecar_dir.join("parser.py").into_os_string())
        );

        let r = resolve_sidecar_with(None, None, &sidecar_dir, None);
        assert!(matches!(r, Err(ParserError::SidecarNotFound)));
        let r = resolve_sidecar_with(None, None, &d.join("empty"), Some(uv));
        assert!(matches!(r, Err(ParserError::SidecarNotFound)));
    }
}
