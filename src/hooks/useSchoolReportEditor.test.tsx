// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSchoolReportEditor } from './useSchoolReportEditor';
import { EMPTY_EDITOR } from '@/lib/school-reports/editor-state';
import { DEFAULT_SCHOOL_REPORT_DESIGN } from '@/lib/school-reports/design';

const request = vi.fn();
vi.mock('@/lib/async-timeout', () => ({ fetchWithTimeoutOrThrow: (...args: unknown[]) => request(...args) }));

let root: Root;
let state: ReturnType<typeof useSchoolReportEditor>;
function Harness({ text, revision = 1 }: { text: string; revision?: number }) {
  state = useSchoolReportEditor({
    reportId: 'book-1', editor: { ...EMPTY_EDITOR, executiveSummary: text },
    design: DEFAULT_SCHOOL_REPORT_DESIGN, enabled: true, published: false,
    lockVersion: revision, baselineVersion: 'loaded-1',
  });
  return null;
}
async function render(text: string, revision = 1) {
  await act(async () => root.render(<Harness text={text} revision={revision} />));
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  request.mockReset();
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); });

describe('school report saving while writing', () => {
  it('retains newer text and its recovery draft when an older save completes', async () => {
    let finish!: (value: unknown) => void;
    request.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render('Saved original');
    await render('First edit');
    let pending!: Promise<void>;
    await act(async () => { pending = state.retrySave(); });
    await render('Second edit while waiting');
    await act(async () => {
      finish({ ok: true, status: 200, json: async () => ({ lockVersion: 2 }) });
      await pending;
    });
    expect(state.isDirty).toBe(true);
    expect(state.hasLocalDraft).toBe(true);
    expect(JSON.parse(localStorage.getItem('school-report-draft:book-1')!).editor.executiveSummary).toBe('Second edit while waiting');
    await render('Second edit while waiting', 2);
    expect(state.isDirty).toBe(true);
  });

  it('clears recovery only when the current text was saved', async () => {
    request.mockResolvedValue({ ok: true, status: 200, json: async () => ({ lockVersion: 2 }) });
    await render('Original');
    await render('Saved edit');
    await act(async () => { await state.retrySave(); });
    expect(state.isDirty).toBe(false);
    expect(localStorage.getItem('school-report-draft:book-1')).toBeNull();
  });

  it('keeps edits and recovery after a failed save', async () => {
    request.mockRejectedValue(new Error('Connection lost'));
    await render('Original');
    await render('Keep this edit');
    await act(async () => { await state.retrySave(); });
    expect(state.isDirty).toBe(true);
    expect(state.saveFailed).toBe(true);
    expect(state.hasLocalDraft).toBe(true);
  });
});
