"""Shared fixtures that build small sample documents on the fly."""

from __future__ import annotations

import sys
from pathlib import Path

import pymupdf
import pytest
from pptx import Presentation
from pptx.util import Inches

SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(SIDECAR_DIR))


@pytest.fixture
def sample_pptx(tmp_path: Path) -> Path:
    prs = Presentation()

    # Slide 1: title + bullet body + speaker notes
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "導入背景"
    body = slide.placeholders[1].text_frame
    body.text = "現状の課題"
    p = body.add_paragraph()
    p.text = "手作業による集計"
    p.level = 1
    notes = slide.notes_slide.notes_text_frame
    notes.text = "ここで課題を強調する"

    # Slide 2: title + table
    slide2 = prs.slides.add_slide(prs.slide_layouts[5])
    slide2.shapes.title.text = "料金プラン"
    rows, cols = 3, 2
    table = slide2.shapes.add_table(rows, cols, Inches(1), Inches(2), Inches(6), Inches(2)).table
    data = [["プラン", "月額"], ["Basic", "1,000円"], ["Pro|Plus", "5,000円"]]
    for r in range(rows):
        for c in range(cols):
            table.cell(r, c).text = data[r][c]

    # Slide 3: blank (image-centric / low text)
    prs.slides.add_slide(prs.slide_layouts[6])

    path = tmp_path / "sample.pptx"
    prs.save(str(path))
    return path


@pytest.fixture
def sample_pdf(tmp_path: Path) -> Path:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text(
        (72, 72),
        "Musubite Specification Document. This page contains enough text to pass.",
    )
    doc.new_page()  # empty page -> low text
    path = tmp_path / "spec.pdf"
    doc.save(str(path))
    doc.close()
    return path


@pytest.fixture
def sample_md(tmp_path: Path) -> Path:
    path = tmp_path / "memo.md"
    path.write_text("# メモ\n\n- 項目A\n- 項目B\n", encoding="utf-8")
    return path


@pytest.fixture
def sample_csv(tmp_path: Path) -> Path:
    path = tmp_path / "data.csv"
    path.write_text("name,price\nA,100\nB|C,200\n", encoding="utf-8")
    return path
