"""Smoke test for the PyInstaller build (scripts/build-sidecar.sh).

Skipped unless MUSUBITE_PARSER_BIN points at a built binary, e.g.:
    MUSUBITE_PARSER_BIN=../src-tauri/binaries/musubite-parser-aarch64-apple-darwin uv run pytest
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import asdict
from pathlib import Path

import pytest

from parser import parse_file

BINARY = os.environ.get("MUSUBITE_PARSER_BIN")

pytestmark = pytest.mark.skipif(
    not BINARY or not Path(BINARY).is_file(), reason="MUSUBITE_PARSER_BIN not set"
)


def test_frozen_binary_matches_in_process_parser(
    sample_pptx: Path, sample_pdf: Path, sample_md: Path, sample_csv: Path
) -> None:
    files = [sample_pptx, sample_pdf, sample_md, sample_csv]
    result = subprocess.run(
        [str(BINARY), *map(str, files)], capture_output=True, check=True, timeout=60
    )
    documents = json.loads(result.stdout.decode("utf-8"))["documents"]
    assert documents == [asdict(parse_file(f)) for f in files]
    assert all(d["error"] is None for d in documents)
