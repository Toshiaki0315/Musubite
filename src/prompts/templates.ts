export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
}

export const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'proposal-draft',
    name: '新規提案書 構成ドラフト',
    description: 'ヒアリング課題と参考資料を統合し、提案書のストーリー構成案を作成します',
    systemInstruction: `あなたは経験豊富なソリューションアーキテクト兼ビジネスコンサルタントです。
以下の<hearing_notes>（お客様ヒアリング結果）と<reference_materials>（複数の参考資料）を統合し、お客様向けの提案資料の構成案をMarkdown形式で作成してください。

# 出力要件
1. エグゼクティブサマリー（課題の本質と提案のコアバリュー）
2. お客様の現状課題の整理（ヒアリング内容に基づく構造化）
3. 解決策・システム/サービス概要（参考資料の仕様・強みを正確に引用）
4. 導入メリット・期待効果
5. 想定スケジュール・次のステップ
6. 資料作成に向けた確認事項・不足情報リスト`
  },
  {
    id: 'requirements-summary',
    name: '要件定義・議事録サマリー',
    description: 'ヒアリング内容と既存仕様資料から、機能要件・非機能要件を整理します',
    systemInstruction: `以下の<hearing_notes>と<reference_materials>をもとに、プロジェクトの要件定義サマリーを作成してください。
- 事実（資料記載事項・ヒアリング発言）と推測・提案事項を明確に分けて記述してください。
- 未確定事項や矛盾点があれば「要確認事項」としてリストアップしてください。`
  },
  {
    id: 'comparison-matrix',
    name: '製品・サービス比較まとめ',
    description: '複数資料のスペックや特徴を抽出し、比較表と選定ポイントを出力します',
    systemInstruction: `以下の<hearing_notes>（選定基準・重視ポイント）と<reference_materials>をもとに、各製品・プランの比較表（Markdownテーブル）と、お客様環境に最適な推奨案を作成してください。`
  },
  {
    id: 'custom',
    name: 'カスタム指示',
    description: '自由に指示を記述します',
    systemInstruction: ''
  }
];

export const CUSTOM_TEMPLATE_ID = 'custom';

export function findTemplate(id: string): PromptTemplate {
  return DEFAULT_TEMPLATES.find((t) => t.id === id) ?? (DEFAULT_TEMPLATES[0] as PromptTemplate);
}

/** Resolve the instruction text for a template, preferring the user's saved edits. */
export function resolveInstruction(id: string, overrides: Record<string, string>): string {
  return overrides[id] ?? findTemplate(id).systemInstruction;
}
