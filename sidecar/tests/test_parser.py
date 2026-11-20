from __future__ import annotations

import json
from pathlib import Path

import pytest

import parser as musubite_parser
from parser import (
    ParsedDocument,
    decode_bytes,
    main,
    markdown_table,
    parse_file,
)


# ---------------------------------------------------------------- helpers
class TestMarkdownTable:
    def test_renders_header_separator_and_rows(self) -> None:
        result = markdown_table([["a", "b"], ["1", "2"]])
        assert result == "| a | b |\n| --- | --- |\n| 1 | 2 |"

    def test_escapes_pipes_and_newlines(self) -> None:
        result = markdown_table([["h"], ["x|y\nz"]])
        assert "x\\|y z" in result

    def test_pads_ragged_rows_and_handles_none(self) -> None:
        result = markdown_table([["a", "b", "c"], ["1", None]])
        assert result.splitlines()[2] == "| 1 |  |  |"

    def test_empty_input_returns_empty_string(self) -> None:
        assert markdown_table([]) == ""
        assert markdown_table([[]]) == ""


class TestDecodeBytes:
    def test_utf8_with_bom(self) -> None:
        assert decode_bytes("﻿こんにちは".encode()) == "こんにちは"

    def test_shift_jis_fallback(self) -> None:
        assert decode_bytes("日本語テキスト".encode("cp932")) == "日本語テキスト"

    def test_undecodable_never_raises(self) -> None:
        assert isinstance(decode_bytes(b"\xff\xfe\xfa\x81\x00"), str)


# ---------------------------------------------------------------- pptx
class TestParsePptx:
    def test_extracts_slides_with_titles(self, sample_pptx: Path) -> None:
        doc = parse_file(sample_pptx)
        assert doc.error is None
        assert doc.type == "pptx"
        assert doc.page_count == 3
        assert [s.index for s in doc.sections] == [1, 2, 3]
        assert doc.sections[0].heading == "Slide 1: 導入背景"
        assert doc.sections[1].heading == "Slide 2: 料金プラン"
        assert doc.sections[2].heading == "Slide 3"

    def test_body_preserves_bullet_levels(self, sample_pptx: Path) -> None:
        body = parse_file(sample_pptx).sections[0].body
        assert "- 現状の課題" in body
        assert "  - 手作業による集計" in body
        assert "導入背景" not in body  # title is not repeated in body

    def test_speaker_notes_are_separate(self, sample_pptx: Path) -> None:
        sections = parse_file(sample_pptx).sections
        assert sections[0].notes == "ここで課題を強調する"
        assert sections[1].notes is None

    def test_tables_become_markdown(self, sample_pptx: Path) -> None:
        body = parse_file(sample_pptx).sections[1].body
        assert "| プラン | 月額 |" in body
        assert "| Pro\\|Plus | 5,000円 |" in body

    def test_low_text_detection(self, sample_pptx: Path) -> None:
        doc = parse_file(sample_pptx)
        assert [s.low_text for s in doc.sections] == [False, False, True]


# ---------------------------------------------------------------- pdf
class TestParsePdf:
    def test_extracts_pages(self, sample_pdf: Path) -> None:
        doc = parse_file(sample_pdf)
        assert doc.error is None
        assert doc.type == "pdf"
        assert doc.page_count == 2
        assert doc.sections[0].heading == "Page 1"
        assert "Musubite Specification Document" in doc.sections[0].body
        assert doc.sections[0].notes is None

    def test_low_text_detection(self, sample_pdf: Path) -> None:
        doc = parse_file(sample_pdf)
        assert [s.low_text for s in doc.sections] == [False, True]

    def test_tables_are_rendered_without_duplication(self, tmp_path: Path) -> None:
        import pymupdf

        doc = pymupdf.open()
        page = doc.new_page()
        page.insert_text((72, 60), "Price table below with header and rows for plans.")
        x0, y0, cw, rh = 72, 100, 150, 24
        cells = [["Plan", "Price"], ["Basic", "100"], ["Pro", "500"]]
        for r, row in enumerate(cells):
            for c, val in enumerate(row):
                rect = pymupdf.Rect(x0 + c * cw, y0 + r * rh, x0 + (c + 1) * cw, y0 + (r + 1) * rh)
                page.draw_rect(rect, color=(0, 0, 0), width=1)
                page.insert_text((rect.x0 + 4, rect.y0 + 16), val)
        path = tmp_path / "table.pdf"
        doc.save(str(path))
        doc.close()

        body = parse_file(path).sections[0].body
        assert "| Plan | Price |" in body
        assert body.count("Basic") == 1


# ---------------------------------------------------------------- text / csv
class TestParseText:
    def test_markdown_is_kept_verbatim(self, sample_md: Path) -> None:
        doc = parse_file(sample_md)
        assert doc.type == "md"
        assert doc.page_count is None
        assert len(doc.sections) == 1
        assert doc.sections[0].heading is None
        assert doc.sections[0].body == "# メモ\n\n- 項目A\n- 項目B"
        assert doc.sections[0].low_text is False

    def test_txt_type(self, tmp_path: Path) -> None:
        path = tmp_path / "note.TXT"
        path.write_text("hello", encoding="utf-8")
        assert parse_file(path).type == "txt"

    def test_csv_becomes_markdown_table(self, sample_csv: Path) -> None:
        doc = parse_file(sample_csv)
        assert doc.type == "csv"
        assert doc.sections[0].body == (
            "| name | price |\n| --- | --- |\n| A | 100 |\n| B\\|C | 200 |"
        )


# ---------------------------------------------------------------- errors
class TestErrors:
    def test_missing_file(self, tmp_path: Path) -> None:
        doc = parse_file(tmp_path / "nope.pdf")
        assert doc.error is not None
        assert doc.sections == []

    def test_unsupported_extension(self, tmp_path: Path) -> None:
        path = tmp_path / "image.png"
        path.write_bytes(b"\x89PNG")
        doc = parse_file(path)
        assert doc.error is not None
        assert "Unsupported" in doc.error

    def test_corrupt_pptx(self, tmp_path: Path) -> None:
        path = tmp_path / "broken.pptx"
        path.write_bytes(b"not a zip")
        doc = parse_file(path)
        assert doc.error is not None
        assert doc.type == "pptx"

    def test_unexpected_exception_is_captured(
        self, sample_md: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def boom(_: Path) -> ParsedDocument:
            raise RuntimeError("kaboom")

        monkeypatch.setitem(musubite_parser.PARSERS, "md", boom)
        doc = parse_file(sample_md)
        assert doc.error is not None and "kaboom" in doc.error


# ---------------------------------------------------------------- cli
class TestCli:
    def test_outputs_json_for_all_files(
        self, sample_pptx: Path, sample_md: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        code = main([str(sample_pptx), str(sample_md)])
        assert code == 0
        payload = json.loads(capsys.readouterr().out)
        docs = payload["documents"]
        assert [d["name"] for d in docs] == ["sample.pptx", "memo.md"]
        assert docs[0]["sections"][0]["notes"] == "ここで課題を強調する"
        assert set(docs[0]["sections"][0]) == {"index", "heading", "body", "notes", "low_text"}
        assert docs[0]["path"] == str(sample_pptx)

    def test_per_file_errors_do_not_fail_the_batch(
        self, tmp_path: Path, sample_md: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        code = main([str(tmp_path / "missing.pdf"), str(sample_md)])
        assert code == 0
        docs = json.loads(capsys.readouterr().out)["documents"]
        assert docs[0]["error"] is not None
        assert docs[1]["error"] is None

    def test_no_arguments_is_usage_error(self, capsys: pytest.CaptureFixture[str]) -> None:
        with pytest.raises(SystemExit) as exc:
            main([])
        assert exc.value.code == 2


class TestHelpers:
    def test_drop_empty_columns(self) -> None:
        from parser import drop_empty_columns

        rows = [["a", None, "b"], ["1", "", "2"], ["3"]]
        assert drop_empty_columns(rows) == [["a", "b"], ["1", "2"], ["3", None]]

    def test_cjk_weighting_for_low_text(self) -> None:
        from parser import _is_low_text

        assert _is_low_text("システム構成図")
        assert not _is_low_text("導入背景 現状の課題 手作業による集計")
        assert _is_low_text("Figure 1")


class TestStdoutIsolation:
    def test_library_output_does_not_corrupt_json(
        self,
        sample_md: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        original = musubite_parser.PARSERS["md"]

        def noisy(path: Path) -> ParsedDocument:
            print("Consider using some optional package")  # e.g. PyMuPDF's hint
            return original(path)

        monkeypatch.setitem(musubite_parser.PARSERS, "md", noisy)
        assert main([str(sample_md)]) == 0
        captured = capsys.readouterr()
        assert json.loads(captured.out)["documents"][0]["name"] == "memo.md"
        assert "Consider using" in captured.err
