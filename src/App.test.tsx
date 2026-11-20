import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { TauriCommands } from './hooks/useTauriCommands';
import type { ParsedDocument } from './types';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

const deck: ParsedDocument = {
  name: 'deck.pptx',
  path: '/docs/deck.pptx',
  type: 'pptx',
  page_count: 2,
  sections: [
    { index: 1, heading: 'Slide 1: 概要', body: '- 製品説明', notes: '補足トーク', low_text: false },
    { index: 2, heading: 'Slide 2', body: '', notes: null, low_text: true },
  ],
  error: null,
};

const cmds: TauriCommands = {
  available: true,
  expandPaths: vi.fn(async (paths: string[]) => paths),
  parseDocuments: vi.fn(async () => ({ documents: [deck] })),
  sendToClaude: vi.fn(async () => ({
    copied: true,
    launched: true,
    pasted: false,
    message: 'クリップボードにコピーしました。Claude Desktop で Cmd+V を押してください',
  })),
  pickFiles: vi.fn(async () => ['/docs/deck.pptx', '/docs/photo.png']),
};

vi.mock('./hooks/useTauriCommands', () => ({ useTauriCommands: () => cmds }));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('parses picked files, builds the payload and sends it to Claude', async () => {
    const user = userEvent.setup();
    render(<App />);

    const sendButton = screen.getByRole('button', { name: 'Claude へ送る' });
    await user.click(screen.getByRole('button', { name: /ここにファイル/ }));

    expect(await screen.findByText('deck.pptx')).toBeInTheDocument();
    expect(cmds.parseDocuments).toHaveBeenCalledWith(['/docs/deck.pptx']);
    expect(screen.getByText('画像主体のページがあります')).toBeInTheDocument();
    expect(screen.getByText('deck.pptx: 2')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/お客様の課題/), '予算は500万円');
    await user.click(screen.getByLabelText('スピーカーノートを除外'));
    await user.click(sendButton);

    await waitFor(() => expect(cmds.sendToClaude).toHaveBeenCalledTimes(1));
    const [payload, autoPaste] = vi.mocked(cmds.sendToClaude).mock.calls[0]!;
    expect(autoPaste).toBe(false);
    expect(payload.startsWith('<instructions>\n')).toBe(true);
    expect(payload).toContain('<hearing_notes>\n予算は500万円\n</hearing_notes>');
    expect(payload).toContain('<document name="deck.pptx" type="pptx" pages="2">');
    expect(payload).not.toContain('補足トーク');
    expect(await screen.findByRole('status')).toHaveTextContent('Cmd+V');
  });

  it('shows an error toast when parsing fails', async () => {
    vi.mocked(cmds.parseDocuments).mockRejectedValueOnce(new Error('sidecar missing'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /ここにファイル/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('sidecar missing');
    expect(screen.getByText('エラー')).toBeInTheDocument();
  });

  it('persists template edits and can reset them', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.selectOptions(screen.getByLabelText('プロンプトテンプレート'), 'custom');
    await user.type(screen.getByLabelText('指示文'), '要約して');
    unmount();

    render(<App />);
    expect(screen.getByLabelText('指示文')).toHaveValue('要約して');
    await user.click(screen.getByRole('button', { name: '既定に戻す' }));
    expect(screen.getByLabelText('指示文')).toHaveValue('');
  });
});
