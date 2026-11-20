# CLAUDE.md - Project Guidelines & Architecture

This file provides guidance to Claude Code (and other AI coding assistants) when working on this repository.

## Project Overview
- **Name**: Musubite（結び手）
- **Repository**: `https://github.com/Toshiaki0315/Musubite.git`
- **Target Platform**: macOS (Apple Silicon / Intel)
- **Purpose**: A local-first macOS desktop application that accepts multiple `.pptx`, `.pdf`, and text/markdown files along with customer hearing notes, converts and structures them into a unified XML/Markdown context, copies it to the macOS clipboard, and launches/focuses **Claude Desktop** (with optional auto-paste).

## Tech Stack
- **Desktop Framework**: Tauri v2 (Rust backend + WebView frontend)
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite
- **Backend (Core OS integration)**: Rust (`tauri-plugin-clipboard-manager`, `tauri-plugin-shell`, `tauri-plugin-dialog`)
- **Document Parser (Sidecar)**: Python 3.11+ (`markitdown`, `pymupdf`, `python-pptx`) bundled as a standalone binary via PyInstaller or executed via `uv` / virtual environment during development.

## Directory Structure
```text
Musubite/
├── CLAUDE.md                  # This file: development rules, architecture, commands
├── README.md                  # User-facing documentation & setup guide
├── .gitignore                 # Git ignore rules for Node, Rust, Python, macOS
├── docs/
│   └── REQUIREMENTS.md        # Detailed functional & non-functional requirements
├── src/                       # Frontend (React + TypeScript)
│   ├── components/            # UI components (FileDropzone, HearingInput, TemplateSelector, TokenMeter)
│   ├── hooks/                 # Custom React hooks (useTauriCommands, useTokenEstimator)
│   ├── prompts/               # Prompt templates for proposal/summary generation
│   └── types/                 # Shared TypeScript interfaces
├── src-tauri/                 # Rust backend (Tauri v2)
│   └── src/
│       ├── main.rs            # Entry point
│       ├── lib.rs             # Tauri command registration
│       ├── claude_bridge.rs   # macOS Claude Desktop launcher & AppleScript paste trigger
│       └── parser_bridge.rs   # Sidecar invocation & JSON/Markdown aggregation
└── sidecar/                   # Python document extraction engine
    ├── parser.py              # CLI entrypoint: converts PDF/PPTX/TXT to structured Markdown
    ├── pyproject.toml         # Python dependencies (markitdown, pytest, etc.)
    └── tests/                 # Unit tests for parser
```

## Coding & Development Rules
1. **Test-Driven Development (TDD)**:
   - Write unit tests before or alongside implementation for both Python (`pytest`) and TypeScript (`vitest`) / Rust (`cargo test`).
   - Target >= 90% test coverage for parser and prompt-builder logic.
2. **Strict Type Safety**:
   - TypeScript: `strict: true`, no `any`.
   - Python: Full type hints (`mypy` / `ruff` compliant).
   - Rust: Avoid `.unwrap()` in production paths; propagate errors cleanly to the Tauri frontend using `Result<T, String>` or `thiserror`.
3. **macOS Integration Specifics**:
   - Launch/focus Claude Desktop using `open -a "Claude"`.
   - Auto-paste via AppleScript (`osascript -e 'tell application "System Events" to keystroke "v" using command down'`) must be **opt-in** via a UI toggle, because macOS requires explicit Accessibility permission (`System Settings > Privacy & Security > Accessibility`) for the app.
   - Always copy the payload to the clipboard first so manual `Cmd+V` works reliably even if Accessibility permissions are denied.
4. **Structured Context Output Format**:
   - Wrap extracted documents in clear XML tags (`<instructions>`, `<hearing_notes>`, `<reference_materials>`, `<document name="..." type="...">`) so Claude Desktop parses boundaries accurately.

## Common Commands
- **Frontend dev**: `npm run dev`
- **Tauri full dev**: `npm run tauri dev`
- **Frontend tests**: `npm test`
- **Rust tests**: `cd src-tauri && cargo test`
- **Python sidecar setup & test**:
  ```bash
  cd sidecar
  uv sync
  uv run pytest
  ```
