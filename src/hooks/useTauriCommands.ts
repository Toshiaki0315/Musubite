import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useMemo } from 'react';
import { SUPPORTED_EXTENSIONS, type ParseResult, type SendResult } from '../types';

export interface TauriCommands {
  available: boolean;
  expandPaths: (paths: string[], recursive: boolean) => Promise<string[]>;
  parseDocuments: (paths: string[]) => Promise<ParseResult>;
  sendToClaude: (payload: string, autoPaste: boolean) => Promise<SendResult>;
  pickFiles: () => Promise<string[]>;
}

const NOT_AVAILABLE = 'Tauri 環境外では利用できません（npm run tauri dev で起動してください）';

function toMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Wrap a Tauri call so rejected promises always carry a readable string message. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Error(toMessage(error));
  }
}

export function useTauriCommands(): TauriCommands {
  return useMemo(() => {
    const available = isTauri();
    const guard = <T>(fn: () => Promise<T>): Promise<T> =>
      available ? call(fn) : Promise.reject(new Error(NOT_AVAILABLE));

    return {
      available,
      expandPaths: (paths, recursive) =>
        guard(() => invoke<string[]>('expand_paths', { paths, recursive })),
      parseDocuments: (paths) => guard(() => invoke<ParseResult>('parse_documents', { paths })),
      sendToClaude: (payload, autoPaste) =>
        guard(() => invoke<SendResult>('send_to_claude', { payload, autoPaste })),
      pickFiles: () =>
        guard(async () => {
          const selected = await open({
            multiple: true,
            directory: false,
            filters: [{ name: '資料', extensions: [...SUPPORTED_EXTENSIONS] }],
          });
          if (selected === null) return [];
          return Array.isArray(selected) ? selected : [selected];
        }),
    };
  }, []);
}
