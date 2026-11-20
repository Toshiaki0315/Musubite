import { SUPPORTED_EXTENSIONS, type FileEntry, type ParsedDocument } from '../types';

export function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

export function isSupportedFile(path: string): boolean {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  const ext = name.slice(dot + 1).toLowerCase();
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

export type FileListAction =
  | { type: 'add'; paths: string[] }
  | { type: 'parsing'; paths: string[] }
  | { type: 'parsed'; documents: ParsedDocument[] }
  | { type: 'failed'; paths: string[]; error: string }
  | { type: 'remove'; path: string }
  | { type: 'move'; path: string; offset: number }
  | { type: 'clear' };

export function fileListReducer(state: FileEntry[], action: FileListAction): FileEntry[] {
  switch (action.type) {
    case 'add': {
      const seen = new Set(state.map((f) => f.path));
      const added: FileEntry[] = [];
      for (const path of action.paths) {
        if (seen.has(path) || !isSupportedFile(path)) continue;
        seen.add(path);
        added.push({ path, name: basename(path), status: 'pending' });
      }
      return added.length ? [...state, ...added] : state;
    }
    case 'parsing': {
      const targets = new Set(action.paths);
      return state.map((f) => (targets.has(f.path) ? { ...f, status: 'parsing' } : f));
    }
    case 'parsed': {
      const byPath = new Map(action.documents.map((d) => [d.path, d]));
      return state.map((f) => {
        const doc = byPath.get(f.path);
        if (!doc) return f;
        return doc.error === null
          ? { ...f, status: 'ready', document: doc, error: undefined }
          : { ...f, status: 'error', document: undefined, error: doc.error };
      });
    }
    case 'failed': {
      const targets = new Set(action.paths);
      return state.map((f) =>
        targets.has(f.path) ? { ...f, status: 'error', error: action.error } : f,
      );
    }
    case 'remove':
      return state.filter((f) => f.path !== action.path);
    case 'move': {
      const from = state.findIndex((f) => f.path === action.path);
      if (from < 0) return state;
      const to = Math.min(Math.max(from + action.offset, 0), state.length - 1);
      if (to === from) return state;
      const next = [...state];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item as FileEntry);
      return next;
    }
    case 'clear':
      return [];
  }
}

export interface LowTextSummary {
  name: string;
  pages: number[];
}

export function collectLowTextPages(documents: ParsedDocument[]): LowTextSummary[] {
  return documents
    .map((d) => ({ name: d.name, pages: d.sections.filter((s) => s.low_text).map((s) => s.index) }))
    .filter((s) => s.pages.length > 0);
}
