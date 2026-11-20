pub mod claude_bridge;
pub mod parser_bridge;

use claude_bridge::{SendResult, SystemRunner};
use parser_bridge::ParseResult;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Run blocking work off the async runtime and flatten join errors into strings.
async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("内部エラー: {e}"))?
}

#[tauri::command]
async fn expand_paths(paths: Vec<String>, recursive: bool) -> Result<Vec<String>, String> {
    blocking(move || Ok(parser_bridge::expand_paths(&paths, recursive))).await
}

#[tauri::command]
async fn parse_documents(paths: Vec<String>) -> Result<ParseResult, String> {
    blocking(move || {
        let sidecar = parser_bridge::resolve_sidecar().map_err(|e| e.to_string())?;
        sidecar.parse(&paths).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
async fn send_to_claude(
    app: AppHandle,
    payload: String,
    auto_paste: bool,
) -> Result<SendResult, String> {
    blocking(move || {
        claude_bridge::deliver(
            &SystemRunner,
            || {
                app.clipboard()
                    .write_text(payload)
                    .map_err(|e| e.to_string())
            },
            auto_paste,
        )
    })
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            expand_paths,
            parse_documents,
            send_to_claude
        ])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        eprintln!("error while running Musubite: {e}");
        std::process::exit(1);
    }
}
