//! macOS Claude Desktop integration: clipboard copy, launch/focus, optional auto-paste.
//!
//! The clipboard copy always happens first so that a manual `Cmd+V` works even when
//! launching Claude or sending the keystroke fails (e.g. Accessibility permission denied).

use serde::Serialize;
use std::process::Command;
use std::thread;
use std::time::Duration;

pub const CLAUDE_APP_NAME: &str = "Claude";
const PASTE_SCRIPT: &str =
    r#"tell application "System Events" to keystroke "v" using command down"#;
/// Time to let an already-running Claude come to the front before pasting.
const WARM_DELAY: Duration = Duration::from_millis(800);
/// Time to let a cold-started Claude finish launching before pasting.
const COLD_DELAY: Duration = Duration::from_millis(3500);

pub const MSG_PASTED: &str = "Claude Desktop に貼り付けました。内容を確認して送信してください";
pub const MSG_COPIED: &str =
    "クリップボードにコピーしました。Claude Desktop で Cmd+V を押してください";
pub const MSG_PASTE_FAILED: &str = "クリップボードにコピーしました。Claude Desktop で Cmd+V を押してください（自動ペーストには「システム設定 > プライバシーとセキュリティ > アクセシビリティ」での許可が必要です）";
pub const MSG_LAUNCH_FAILED: &str = "クリップボードにコピーしました。Claude Desktop を起動できませんでした（/Applications に Claude.app があるか確認してください）";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SendResult {
    pub copied: bool,
    pub launched: bool,
    pub pasted: bool,
    pub message: String,
}

/// Abstraction over process execution so the orchestration can be unit-tested.
pub trait CommandRunner {
    /// Run `program args...`; `Ok(())` on exit status 0, otherwise `Err(stderr)`.
    fn run(&self, program: &str, args: &[&str]) -> Result<(), String>;
    fn sleep(&self, duration: Duration);
}

pub struct SystemRunner;

impl CommandRunner for SystemRunner {
    fn run(&self, program: &str, args: &[&str]) -> Result<(), String> {
        let output = Command::new(program)
            .args(args)
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }

    fn sleep(&self, duration: Duration) {
        thread::sleep(duration);
    }
}

pub fn is_claude_running(runner: &dyn CommandRunner) -> bool {
    runner.run("pgrep", &["-x", CLAUDE_APP_NAME]).is_ok()
}

pub fn launch_claude(runner: &dyn CommandRunner) -> Result<(), String> {
    runner.run("open", &["-a", CLAUDE_APP_NAME])
}

pub fn trigger_paste(runner: &dyn CommandRunner) -> Result<(), String> {
    runner.run("osascript", &["-e", PASTE_SCRIPT])
}

/// Copy → launch/focus → (optional) paste. Only a clipboard failure is an error;
/// everything after it degrades gracefully into an informative message.
pub fn deliver(
    runner: &dyn CommandRunner,
    copy_to_clipboard: impl FnOnce() -> Result<(), String>,
    auto_paste: bool,
) -> Result<SendResult, String> {
    copy_to_clipboard().map_err(|e| format!("クリップボードへのコピーに失敗しました: {e}"))?;

    let was_running = auto_paste && is_claude_running(runner);
    if launch_claude(runner).is_err() {
        return Ok(SendResult {
            copied: true,
            launched: false,
            pasted: false,
            message: MSG_LAUNCH_FAILED.into(),
        });
    }

    if !auto_paste {
        return Ok(SendResult {
            copied: true,
            launched: true,
            pasted: false,
            message: MSG_COPIED.into(),
        });
    }

    runner.sleep(if was_running { WARM_DELAY } else { COLD_DELAY });
    let pasted = trigger_paste(runner).is_ok();
    Ok(SendResult {
        copied: true,
        launched: true,
        pasted,
        message: if pasted { MSG_PASTED } else { MSG_PASTE_FAILED }.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct FakeRunner {
        calls: RefCell<Vec<String>>,
        sleeps: RefCell<Vec<Duration>>,
        fail: Vec<&'static str>,
    }

    impl FakeRunner {
        fn failing(fail: Vec<&'static str>) -> Self {
            Self {
                fail,
                ..Default::default()
            }
        }
        fn programs(&self) -> Vec<String> {
            self.calls
                .borrow()
                .iter()
                .map(|c| c.split(' ').next().unwrap_or("").to_string())
                .collect()
        }
    }

    impl CommandRunner for FakeRunner {
        fn run(&self, program: &str, args: &[&str]) -> Result<(), String> {
            self.calls
                .borrow_mut()
                .push(format!("{program} {}", args.join(" ")));
            if self.fail.contains(&program) {
                Err(format!("{program} failed"))
            } else {
                Ok(())
            }
        }
        fn sleep(&self, duration: Duration) {
            self.sleeps.borrow_mut().push(duration);
        }
    }

    #[test]
    fn copies_and_launches_without_paste() {
        let runner = FakeRunner::default();
        let copied = RefCell::new(false);
        let result = deliver(
            &runner,
            || {
                *copied.borrow_mut() = true;
                Ok(())
            },
            false,
        )
        .expect("ok");
        assert!(*copied.borrow());
        assert_eq!(
            result,
            SendResult {
                copied: true,
                launched: true,
                pasted: false,
                message: MSG_COPIED.into()
            }
        );
        assert_eq!(*runner.calls.borrow(), vec!["open -a Claude".to_string()]);
        assert!(runner.sleeps.borrow().is_empty());
    }

    #[test]
    fn auto_paste_when_running_uses_short_delay() {
        let runner = FakeRunner::default();
        let result = deliver(&runner, || Ok(()), true).expect("ok");
        assert!(result.pasted);
        assert_eq!(result.message, MSG_PASTED);
        assert_eq!(runner.programs(), vec!["pgrep", "open", "osascript"]);
        assert_eq!(*runner.sleeps.borrow(), vec![WARM_DELAY]);
        assert!(runner.calls.borrow()[2].contains("keystroke \"v\" using command down"));
    }

    #[test]
    fn auto_paste_cold_start_waits_longer() {
        let runner = FakeRunner::failing(vec!["pgrep"]);
        let result = deliver(&runner, || Ok(()), true).expect("ok");
        assert!(result.pasted);
        assert_eq!(*runner.sleeps.borrow(), vec![COLD_DELAY]);
    }

    #[test]
    fn paste_failure_still_reports_clipboard_success() {
        let runner = FakeRunner::failing(vec!["osascript"]);
        let result = deliver(&runner, || Ok(()), true).expect("ok");
        assert_eq!(
            result,
            SendResult {
                copied: true,
                launched: true,
                pasted: false,
                message: MSG_PASTE_FAILED.into()
            }
        );
    }

    #[test]
    fn launch_failure_skips_paste() {
        let runner = FakeRunner::failing(vec!["open"]);
        let result = deliver(&runner, || Ok(()), true).expect("ok");
        assert!(!result.launched && !result.pasted && result.copied);
        assert_eq!(result.message, MSG_LAUNCH_FAILED);
        assert_eq!(runner.programs(), vec!["pgrep", "open"]);
    }

    #[test]
    fn clipboard_failure_aborts_before_launch() {
        let runner = FakeRunner::default();
        let err = deliver(&runner, || Err("denied".into()), true).expect_err("err");
        assert!(err.contains("denied"));
        assert!(runner.calls.borrow().is_empty());
    }

    #[test]
    fn system_runner_reports_exit_status() {
        let runner = SystemRunner;
        assert!(runner.run("true", &[]).is_ok());
        assert!(runner.run("false", &[]).is_err());
        assert!(runner.run("/nonexistent/binary", &[]).is_err());
        runner.sleep(Duration::from_millis(1));
    }
}
