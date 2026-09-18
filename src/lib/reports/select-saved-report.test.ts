import { describe, expect, it } from 'vitest';
import { selectSavedReport } from './select-saved-report';

const old = { id: 'old', course_id: 'coding', report_term: 'Third Term', report_period: '2025/2026', is_published: true };
const current = { id: 'current', course_id: 'coding', report_term: 'First Term', report_period: '2026/2027', is_published: true };
const session = { term: 'First Term', period: '2026/2027' };

describe('saved report selection', () => {
    it('opens the selected term even if an old published report comes first', () => {
        expect(selectSavedReport([old, current], { session })).toBe(current);
    });
    it('does not substitute an old report for an empty term', () => {
        expect(selectSavedReport([old], { session })).toBeNull();
    });
    it('does not substitute another course', () => {
        expect(selectSavedReport([current], { session, courseId: 'robotics' })).toBeNull();
    });
    it('honours an explicit older report', () => {
        expect(selectSavedReport([old, current], { session, reportId: old.id })).toBe(old);
    });
    it('does not substitute another report for a missing explicit record', () => {
        expect(selectSavedReport([current], { session, reportId: 'missing' })).toBeNull();
    });
    it('keeps the published status and scores on the original record', () => {
        const scored = { ...current, theory_score: 0, practical_score: 27 };
        expect(selectSavedReport([scored], { session })).toBe(scored);
    });
    it('supports history without a term filter', () => {
        expect(selectSavedReport([current, old], {})).toBe(current);
    });
});
