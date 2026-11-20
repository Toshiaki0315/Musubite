"""Override of the contrib PyMuPDF hook: skip the optional layout-analysis ONNX
models (~40 MB) that the parser never uses."""

from PyInstaller.utils.hooks import collect_data_files

datas = collect_data_files("pymupdf", excludes=["layout", "layout/**"])
