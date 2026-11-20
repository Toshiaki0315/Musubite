/** Shared types. Snake_case fields mirror the JSON emitted by the Python sidecar. */

export const SUPPORTED_EXTENSIONS = ['pptx', 'pdf', 'md', 'markdown', 'txt', 'csv'] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export interface Section {
  index: number;
  heading: string | null;
  body: string;
  notes: string | null;
  low_text: boolean;
}

export interface ParsedDocument {
  name: string;
  path: string;
  type: string;
  page_count: number | null;
  sections: Section[];
  error: string | null;
}

export interface ParseResult {
  documents: ParsedDocument[];
}

export interface BuildOptions {
  /** Drop PPTX speaker notes from the output. */
  excludeNotes: boolean;
  /** Collapse redundant blank lines and runs of spaces. */
  compressWhitespace: boolean;
}

export interface SendResult {
  copied: boolean;
  launched: boolean;
  pasted: boolean;
  /** Human-readable status shown in the toast. */
  message: string;
}

export type FileStatus = 'pending' | 'parsing' | 'ready' | 'error';

export interface FileEntry {
  path: string;
  name: string;
  status: FileStatus;
  document?: ParsedDocument;
  error?: string;
}
