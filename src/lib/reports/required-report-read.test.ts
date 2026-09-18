import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { requiredReportRead } from './required-report-read';

afterEach(() => vi.useRealTimers());

describe('saved report opening', () => {
    it('preserves saved scores unchanged', async () => {
        const data = { id: 'report', theory_score: 0, practical_score: 27 };
        expect((await requiredReportRead(Promise.resolve({ data, error: null }))).data).toBe(data);
    });
    it('allows a genuinely empty lookup', async () => {
        expect((await requiredReportRead(Promise.resolve({ data: null, error: null }))).data).toBeNull();
    });
    it('does not turn database failures into empty reports', async () => {
        await expect(requiredReportRead(Promise.resolve({ data: null, error: { message: 'private database detail' } })))
            .rejects.toThrow('Please choose the student again');
    });
    it('uses plain feedback for connection failures', async () => {
        await expect(requiredReportRead(Promise.reject(new Error('internal detail'))))
            .rejects.toThrow('Your saved report could not be opened');
    });
    it('ends a stalled lookup without returning a blank report', async () => {
        vi.useFakeTimers();
        const result = requiredReportRead(new Promise<{ data: null; error: null }>(() => {}));
        const assertion = expect(result).rejects.toThrow('Please choose the student again');
        await vi.advanceTimersByTimeAsync(12_000);
        await assertion;
    });
    it('keeps the editor and save action closed during a student switch', () => {
        const source = readFileSync('src/app/dashboard/reports/builder/page.tsx', 'utf8');
        expect(source).toContain('if (openingReport.current) return false;');
        expect(source).toContain('sessionDone && selectedStudent && !openingStudentName');
        expect(source).toContain('const report = explicitReport ?? scopedReport;');
        expect(source).not.toContain('keepRequestedSession && opts?.forceHydrate ? latestReport');
        expect(source).toContain('if (selection !== selectionVersion.current) return;');
        expect(source).toContain('setForm({ ...emptyReportForm.current, student_name:');
    });
});
