# Musubite（結び手）

複数の PowerPoint (`.pptx`) や PDF (`.pdf`) 資料とお客様のヒアリング結果をドラッグ＆ドロップで**結び・繋ぎ・仕立てる**ことで構造化統合し、ワンクリックで **Claude Desktop** へ引き渡す macOS 向けローカルデスクトップアプリです。

## 主な特徴
- **ローカル完結の高速パース**: PPTXのスライド本文・表・スピーカーノートやPDFを構造化Markdownへ自動変換。
- **XMLタグによる文脈構造化**: 複数資料の境界とヒアリングメモを明確に分離し、Claudeがハルシネーションを起こしにくいプロンプトを自動生成。
- **ワンクリック連携**: クリップボードへのコピーと同時に Claude Desktop を最前面へ呼び出し（オプションで自動ペーストにも対応）。
- **トークン数メーター**: 送信前に文字数・推定トークン数を可視化し、コンテキスト超過を防止。

## 技術スタック
- **Framework**: Tauri v2 (Rust)
- **Frontend**: React + TypeScript + Tailwind CSS
- **Document Parser**: Python (`markitdown`, `pymupdf`, `python-pptx`)

## セットアップ（開発環境）

### 前提条件
- macOS 13.0+
- Node.js 20+
- Rust (rustup)
- Python 3.11+ & `uv`
- [Claude Desktop](https://claude.ai/download) が `/Applications/Claude.app` にインストールされていること

### インストール手順
```bash
# リポジトリのクローン
git clone https://github.com/Toshiaki0315/Musubite.git
cd Musubite

# 1. フロントエンド依存関係のインストール
npm install

# 2. Python パーサー環境のセットアップ
cd sidecar
uv sync
cd ..

# 3. 開発サーバーの起動
npm run tauri dev
```

### テスト・静的チェック
```bash
npm test                        # フロントエンド (vitest)
npm run coverage                # カバレッジ付き
cd src-tauri && cargo test      # Rust
cd sidecar && uv run pytest --cov=parser && uv run ruff check . && uv run mypy
```

### パーサー（sidecar）の解決順序
Rust 側は次の順でパーサーを探します。
1. 環境変数 `MUSUBITE_SIDECAR`（実行ファイルのパス）
2. アプリ実行ファイルと同じディレクトリの `musubite-parser`（PyInstaller でビルドしたバイナリ）
3. 開発時: `uv run --project sidecar python sidecar/parser.py`

## macOS での自動ペースト権限について
「自動ペースト（Auto-Paste）」機能を有効にする場合、macOS の **システム設定 > プライバシーとセキュリティ > アクセシビリティ** から、Musubite（開発時はターミナルまたはビルド済み `Musubite.app`）の制御を許可してください。
権限を付与しない場合でも、クリップボードへのコピーと Claude Desktop の起動は動作するため、手動で `Cmd + V` を押すことで利用可能です。

## ライセンス
MIT License
