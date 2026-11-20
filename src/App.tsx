import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { FileDropzone } from './components/FileDropzone';
import { FileList } from './components/FileList';
import { HearingInput } from './components/HearingInput';
import { LowTextAlert } from './components/LowTextAlert';
import { TemplateSelector } from './components/TemplateSelector';
import { Toast, type ToastMessage } from './components/Toast';
import { Toggle } from './components/Toggle';
import { TokenMeter } from './components/TokenMeter';
import { useTauriCommands } from './hooks/useTauriCommands';
import { useTokenEstimator } from './hooks/useTokenEstimator';
import { collectLowTextPages, fileListReducer, isSupportedFile } from './lib/fileList';
import { buildContext } from './lib/promptBuilder';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import { findTemplate, resolveInstruction } from './prompts/templates';

export default function App() {
  const cmds = useTauriCommands();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [files, dispatch] = useReducer(fileListReducer, []);
  const [hearingNotes, setHearingNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const filesRef = useRef(files);
  const recursiveRef = useRef(settings.recursiveFolders);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    recursiveRef.current = settings.recursiveFolders;
    saveSettings(settings);
  }, [settings]);

  const notify = useCallback((kind: ToastMessage['kind'], text: string) => {
    setToast({ id: Date.now(), kind, text });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  // ------------------------------------------------------------- files
  const addPaths = useCallback(
    async (raw: string[]) => {
      let expanded: string[];
      try {
        expanded = await cmds.expandPaths(raw, recursiveRef.current);
      } catch (e) {
        notify('error', (e as Error).message);
        return;
      }
      const existing = new Set(filesRef.current.map((f) => f.path));
      const fresh = [...new Set(expanded)].filter((p) => !existing.has(p) && isSupportedFile(p));
      if (fresh.length === 0) {
        notify('info', '追加できる対応ファイルが見つかりませんでした');
        return;
      }
      dispatch({ type: 'add', paths: fresh });
      dispatch({ type: 'parsing', paths: fresh });
      try {
        const result = await cmds.parseDocuments(fresh);
        dispatch({ type: 'parsed', documents: result.documents });
      } catch (e) {
        dispatch({ type: 'failed', paths: fresh, error: (e as Error).message });
        notify('error', `解析に失敗しました: ${(e as Error).message}`);
      }
    },
    [cmds, notify],
  );

  const pickFiles = useCallback(async () => {
    try {
      const paths = await cmds.pickFiles();
      if (paths.length) await addPaths(paths);
    } catch (e) {
      notify('error', (e as Error).message);
    }
  }, [cmds, addPaths, notify]);

  // ------------------------------------------------------------- payload
  const instruction = resolveInstruction(settings.templateId, settings.templateOverrides);
  const templateModified =
    settings.templateId in settings.templateOverrides &&
    instruction !== findTemplate(settings.templateId).systemInstruction;

  const documents = useMemo(
    () => files.flatMap((f) => (f.status === 'ready' && f.document ? [f.document] : [])),
    [files],
  );
  const payload = useMemo(
    () =>
      buildContext({
        instruction,
        hearingNotes,
        documents,
        options: settings.options,
        wrapInstruction: true,
      }),
    [instruction, hearingNotes, documents, settings.options],
  );
  const estimate = useTokenEstimator(payload);
  const lowText = useMemo(() => collectLowTextPages(documents), [documents]);
  const busy = files.some((f) => f.status === 'parsing');

  const send = useCallback(async () => {
    if (!payload) {
      notify('info', '送信する内容がありません。資料かヒアリングメモを追加してください');
      return;
    }
    setSending(true);
    try {
      const result = await cmds.sendToClaude(payload, settings.autoPaste);
      notify(result.pasted || !settings.autoPaste ? 'success' : 'info', result.message);
    } catch (e) {
      notify('error', (e as Error).message);
    } finally {
      setSending(false);
    }
  }, [cmds, payload, settings.autoPaste, notify]);

  // ------------------------------------------------------------- view
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline gap-2 border-b border-stone-200 px-5 py-3 dark:border-stone-700">
        <h1 className="text-lg font-bold tracking-wide">
          Musubite<span className="ml-1 text-sm font-normal text-stone-400">結び手</span>
        </h1>
        <p className="text-xs text-stone-400">資料とヒアリングを結んで Claude へ</p>
        {!cmds.available && (
          <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
            ブラウザプレビュー（Tauri 機能は無効）
          </span>
        )}
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 md:grid-cols-2">
        <section className="flex min-h-0 flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-stone-500">参考資料</h2>
          <FileDropzone onPaths={addPaths} onPick={pickFiles} />
          <FileList
            files={files}
            onRemove={(path) => dispatch({ type: 'remove', path })}
            onMove={(path, offset) => dispatch({ type: 'move', path, offset })}
            onClear={() => dispatch({ type: 'clear' })}
          />
          <LowTextAlert items={lowText} />
          <div className="mt-auto flex flex-col gap-2 rounded-lg bg-stone-100 p-3 dark:bg-stone-800/60">
            <Toggle
              label="スピーカーノートを除外"
              checked={settings.options.excludeNotes}
              onChange={(v) => update({ options: { ...settings.options, excludeNotes: v } })}
            />
            <Toggle
              label="空白・改行を圧縮"
              checked={settings.options.compressWhitespace}
              onChange={(v) => update({ options: { ...settings.options, compressWhitespace: v } })}
            />
            <Toggle
              label="フォルダ内を再帰的に取り込む"
              checked={settings.recursiveFolders}
              onChange={(v) => update({ recursiveFolders: v })}
            />
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-4">
          <TemplateSelector
            templateId={settings.templateId}
            instruction={instruction}
            modified={templateModified}
            onSelect={(id) => update({ templateId: id })}
            onChange={(text) =>
              update({ templateOverrides: { ...settings.templateOverrides, [settings.templateId]: text } })
            }
            onReset={() => {
              const { [settings.templateId]: _removed, ...rest } = settings.templateOverrides;
              update({ templateOverrides: rest });
            }}
          />
          <HearingInput value={hearingNotes} onChange={setHearingNotes} />
          <details className="rounded-lg border border-stone-200 text-xs dark:border-stone-700">
            <summary className="cursor-pointer px-3 py-2 text-stone-500">送信内容をプレビュー</summary>
            <pre className="max-h-64 overflow-auto border-t border-stone-200 p-3 whitespace-pre-wrap select-text dark:border-stone-700">
              {payload || '（まだ内容がありません）'}
            </pre>
          </details>
        </section>
      </main>

      <footer className="flex items-center gap-4 border-t border-stone-200 bg-white px-5 py-3 dark:border-stone-700 dark:bg-stone-900">
        <TokenMeter estimate={estimate} />
        <Toggle
          label="自動ペースト"
          hint="アクセシビリティ権限が必要です"
          checked={settings.autoPaste}
          onChange={(v) => update({ autoPaste: v })}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || busy || !payload}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? '送信中…' : busy ? '解析中…' : 'Claude へ送る'}
        </button>
      </footer>

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
