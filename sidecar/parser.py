"""Musubite document extraction sidecar.

Usage:
    python parser.py FILE [FILE ...]

Writes a JSON object to stdout::

    {"documents": [{"name", "path", "type", "page_count", "sections", "error"}, ...]}

Each section is ``{"index", "heading", "body", "notes", "low_text"}``. ``body`` is
Markdown; speaker notes are kept separately in ``notes`` so the frontend can
exclude them without re-parsing. A failure on one file is reported in its
``error`` field and never aborts the batch.
"""

from __future__ import annotations

import argparse
import contextlib
import csv
import io
import json
import os
import sys
from collections.abc import Callable, Iterable, Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# Pages/slides whose weighted character count is below this are flagged as
# image-centric so the UI can recommend dropping the original into Claude.
# CJK characters carry more information, so they count double.
LOW_TEXT_THRESHOLD = 30


@dataclass
class Section:
    index: int
    heading: str | None
    body: str
    notes: str | None = None
    low_text: bool = False


@dataclass
class ParsedDocument:
    name: str
    path: str
    type: str
    page_count: int | None = None
    sections: list[Section] = field(default_factory=list)
    error: str | None = None


# ---------------------------------------------------------------- helpers


def _cell(value: object) -> str:
    text = "" if value is None else str(value)
    return text.replace("\r\n", " ").replace("\n", " ").replace("|", "\\|").strip()


def markdown_table(rows: Sequence[Sequence[object]]) -> str:
    """Render rows (first row is the header) as a GitHub-flavoured Markdown table."""
    width = max((len(r) for r in rows), default=0)
    if width == 0:
        return ""
    normalized = [[_cell(c) for c in r] + [""] * (width - len(r)) for r in rows]
    lines = ["| " + " | ".join(normalized[0]) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines += ["| " + " | ".join(r) + " |" for r in normalized[1:]]
    return "\n".join(lines)


def decode_bytes(data: bytes) -> str:
    """Decode text files that may be UTF-8 (with/without BOM) or Shift_JIS."""
    for encoding in ("utf-8-sig", "cp932"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _text_weight(text: str) -> int:
    return sum(2 if ord(ch) >= 0x2E80 else 1 for ch in text if not ch.isspace())


def _is_low_text(*parts: str) -> bool:
    return sum(_text_weight(p) for p in parts) < LOW_TEXT_THRESHOLD


def drop_empty_columns(rows: Sequence[Sequence[object]]) -> list[list[object]]:
    """Remove columns that are empty in every row (common PDF table-detection artifact)."""
    width = max((len(r) for r in rows), default=0)
    padded = [list(r) + [None] * (width - len(r)) for r in rows]
    keep = [i for i in range(width) if any(_cell(r[i]) for r in padded)]
    return [[r[i] for i in keep] for r in padded]


# ---------------------------------------------------------------- pptx


def _iter_shapes(shapes: Iterable[Any]) -> Iterable[Any]:
    """Yield shapes in reading order (top-to-bottom, left-to-right), flattening groups."""
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    def key(s: Any) -> tuple[int, int]:
        return (s.top or 0, s.left or 0)

    for shape in sorted(shapes, key=key):
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _iter_shapes(shape.shapes)
        else:
            yield shape


def parse_pptx(path: Path) -> ParsedDocument:
    from pptx import Presentation

    prs = Presentation(str(path))
    doc = ParsedDocument(name=path.name, path=str(path), type="pptx")

    for number, slide in enumerate(prs.slides, start=1):
        title_shape = slide.shapes.title
        title = title_shape.text_frame.text.strip() if title_shape is not None else ""
        title_id = title_shape.shape_id if title_shape is not None else None

        blocks: list[str] = []
        for shape in _iter_shapes(slide.shapes):
            if shape.shape_id == title_id:
                continue
            if getattr(shape, "has_table", False) and shape.has_table:
                rows = [[cell.text for cell in row.cells] for row in shape.table.rows]
                table_md = markdown_table(rows)
                if table_md:
                    blocks.append(table_md)
            elif getattr(shape, "has_text_frame", False) and shape.has_text_frame:
                lines = [
                    "  " * p.level + "- " + p.text.strip()
                    for p in shape.text_frame.paragraphs
                    if p.text.strip()
                ]
                if lines:
                    blocks.append("\n".join(lines))

        notes: str | None = None
        if slide.has_notes_slide:
            notes_frame = slide.notes_slide.notes_text_frame
            notes_text = notes_frame.text.strip() if notes_frame is not None else ""
            notes = notes_text or None

        body = "\n\n".join(blocks)
        doc.sections.append(
            Section(
                index=number,
                heading=f"Slide {number}: {title}" if title else f"Slide {number}",
                body=body,
                notes=notes,
                low_text=_is_low_text(title, body),
            )
        )

    doc.page_count = len(doc.sections)
    return doc


# ---------------------------------------------------------------- pdf


def parse_pdf(path: Path) -> ParsedDocument:
    import pymupdf

    doc = ParsedDocument(name=path.name, path=str(path), type="pdf")
    with pymupdf.open(str(path)) as pdf:
        for number, page in enumerate(pdf, start=1):
            table_rects: list[Any] = []
            table_blocks: list[str] = []
            try:
                for table in page.find_tables().tables:
                    rendered = markdown_table(drop_empty_columns(table.extract()))
                    if rendered:
                        table_rects.append(pymupdf.Rect(table.bbox))
                        table_blocks.append(rendered)
            except Exception:  # noqa: BLE001 - table detection is best-effort
                table_rects, table_blocks = [], []

            text_blocks: list[str] = []
            for block in page.get_text("blocks", sort=True):
                x0, y0, x1, y1, text, _no, block_type = block[:7]
                if block_type != 0:  # 1 = image block
                    continue
                rect = pymupdf.Rect(x0, y0, x1, y1)
                if any(rect.intersects(t) for t in table_rects):
                    continue
                cleaned = text.strip()
                if cleaned:
                    text_blocks.append(cleaned)

            body = "\n\n".join(text_blocks + table_blocks)
            doc.sections.append(
                Section(
                    index=number,
                    heading=f"Page {number}",
                    body=body,
                    low_text=_is_low_text(body),
                )
            )
    doc.page_count = len(doc.sections)
    return doc


# ---------------------------------------------------------------- text / csv


def _text_parser(kind: str) -> Callable[[Path], ParsedDocument]:
    def parse(path: Path) -> ParsedDocument:
        body = decode_bytes(path.read_bytes()).strip()
        return ParsedDocument(
            name=path.name,
            path=str(path),
            type=kind,
            sections=[Section(index=1, heading=None, body=body)],
        )

    return parse


def parse_csv(path: Path) -> ParsedDocument:
    text = decode_bytes(path.read_bytes())
    rows = [row for row in csv.reader(io.StringIO(text)) if row]
    return ParsedDocument(
        name=path.name,
        path=str(path),
        type="csv",
        sections=[Section(index=1, heading=None, body=markdown_table(rows))],
    )


PARSERS: dict[str, Callable[[Path], ParsedDocument]] = {
    "pptx": parse_pptx,
    "pdf": parse_pdf,
    "md": _text_parser("md"),
    "markdown": _text_parser("md"),
    "txt": _text_parser("txt"),
    "csv": parse_csv,
}


def parse_file(path: Path) -> ParsedDocument:
    ext = path.suffix.lower().lstrip(".")
    kind = "md" if ext == "markdown" else ext
    parser_fn = PARSERS.get(ext)
    if parser_fn is None:
        return ParsedDocument(
            name=path.name, path=str(path), type=kind, error=f"Unsupported file type: .{ext}"
        )
    if not path.is_file():
        return ParsedDocument(name=path.name, path=str(path), type=kind, error="File not found")
    try:
        return parser_fn(path)
    except Exception as exc:  # noqa: BLE001 - report any failure per file
        return ParsedDocument(
            name=path.name,
            path=str(path),
            type=kind,
            error=f"{type(exc).__name__}: {exc}",
        )


# ---------------------------------------------------------------- cli


def main(argv: Sequence[str] | None = None) -> int:
    arg_parser = argparse.ArgumentParser(description="Extract documents to structured JSON.")
    arg_parser.add_argument(
        "files", nargs="+", help="Files to parse (.pptx, .pdf, .md, .txt, .csv)"
    )
    args = arg_parser.parse_args(argv)

    # stdout carries only the JSON result. Libraries sometimes print hints there
    # (e.g. PyMuPDF's layout-package suggestion), so divert them to stderr.
    os.environ.setdefault("PYMUPDF_SUGGEST_LAYOUT_ANALYZER", "0")
    with contextlib.redirect_stdout(sys.stderr):
        documents = [asdict(parse_file(Path(f))) for f in args.files]
    sys.stdout.write(json.dumps({"documents": documents}, ensure_ascii=False))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
