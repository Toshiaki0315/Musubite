#!/usr/bin/env bash
# Build the Python parser into a single executable that Tauri bundles as an
# external binary. Output: src-tauri/binaries/musubite-parser-<target-triple>
#
# Usage: scripts/build-sidecar.sh [target-triple]
#   The triple defaults to the Rust host (e.g. aarch64-apple-darwin). PyInstaller
#   can only build for the architecture of the Python interpreter it runs on.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIDECAR="$ROOT/sidecar"
OUT_DIR="$ROOT/src-tauri/binaries"
TRIPLE="${1:-$(rustc --print host-tuple 2>/dev/null || rustc -vV | sed -n 's/^host: //p')}"
NAME="musubite-parser"
WORK="$SIDECAR/build"

mkdir -p "$OUT_DIR"
cd "$SIDECAR"
uv sync --quiet
uv run --quiet pyinstaller \
  --onefile \
  --noconfirm \
  --clean \
  --log-level WARN \
  --name "$NAME" \
  --distpath "$WORK/dist" \
  --workpath "$WORK/work" \
  --specpath "$WORK" \
  --collect-data pptx \
  --additional-hooks-dir "$SIDECAR/pyinstaller_hooks" \
  --exclude-module markitdown \
  --exclude-module tkinter \
  --exclude-module pymupdf.layout \
  --exclude-module pandas \
  --exclude-module numpy \
  --exclude-module openpyxl \
  --exclude-module onnxruntime \
  --exclude-module magika \
  parser.py

cp "$WORK/dist/$NAME" "$OUT_DIR/$NAME-$TRIPLE"
chmod +x "$OUT_DIR/$NAME-$TRIPLE"
echo "Built $OUT_DIR/$NAME-$TRIPLE"
