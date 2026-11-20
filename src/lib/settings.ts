import type { BuildOptions } from '../types';

export interface Settings {
  templateId: string;
  templateOverrides: Record<string, string>;
  options: BuildOptions;
  autoPaste: boolean;
  recursiveFolders: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  templateId: 'proposal-draft',
  templateOverrides: {},
  options: { excludeNotes: false, compressWhitespace: false },
  autoPaste: false,
  recursiveFolders: true,
};

const STORAGE_KEY = 'musubite.settings.v1';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Parse persisted settings defensively; unknown or malformed fields fall back to defaults. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!isRecord(data)) return DEFAULT_SETTINGS;

  const overrides: Record<string, string> = {};
  if (isRecord(data.templateOverrides)) {
    for (const [k, v] of Object.entries(data.templateOverrides)) {
      if (typeof v === 'string') overrides[k] = v;
    }
  }
  const opts = isRecord(data.options) ? data.options : {};
  const d = DEFAULT_SETTINGS;
  return {
    templateId: typeof data.templateId === 'string' ? data.templateId : d.templateId,
    templateOverrides: overrides,
    options: {
      excludeNotes: bool(opts.excludeNotes, d.options.excludeNotes),
      compressWhitespace: bool(opts.compressWhitespace, d.options.compressWhitespace),
    },
    autoPaste: bool(data.autoPaste, d.autoPaste),
    recursiveFolders: bool(data.recursiveFolders, d.recursiveFolders),
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Settings {
  try {
    return parseSettings(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(
  settings: Settings,
  storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode / quota); settings are a convenience only.
  }
}
