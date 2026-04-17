// Feature: rillcod-web-improvements
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { gamificationService, ActivityType } from '../gamification.service';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(),
}));

describe('GamificationService Property-Based Tests', () => {
    it('should be idempotent for (userId, activityType, referenceId) triple', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                fc.constantFrom('lesson_complete', 'assignment_submit', 'quiz_pass', 'discussion_post', 'daily_login' as ActivityType),
                fc.uuid(),
                async (userId, activityType, referenceId) => {
                    const mockSupabase = {
                        from: vi.fn().mockReturnThis(),
                        insert: vi.fn(),
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        single: vi.fn(),
                        upsert: vi.fn(),
                    };

                    (createClient as any).mockResolvedValue(mockSupabase);

                    // First call: Successful insert
                    mockSupabase.insert.mockResolvedValueOnce({ count: 1, error: null });
                    mockSupabase.single
                        .mockResolvedValueOnce({ data: { sum: 10 }, error: null }) // step 2: sum
                        .mockResolvedValueOnce({ data: { achievement_level: 'Bronze' }, error: null }); // step 3: current points
                    mockSupabase.upsert.mockResolvedValueOnce({ error: null });

                    const result1 = await gamificationService.awardPoints(userId, activityType, referenceId);
                    expect(result1.awarded).toBe(true);

                    // Second call: Duplicate, count should be 0
                    mockSupabase.insert.mockResolvedValueOnce({ count: 0, error: null });
                    mockSupabase.single
                        .mockResolvedValueOnce({ data: { sum: 10 }, error: null }) // step 2: sum
                        .mockResolvedValueOnce({ data: { achievement_level: 'Bronze' }, error: null }); // step 3: current points
                    mockSupabase.upsert.mockResolvedValueOnce({ error: null });

                    const result2 = await gamificationService.awardPoints(userId, activityType, referenceId);
                    expect(result2.awarded).toBe(false);
                    expect(result2.totalPoints).toBe(result1.totalPoints);
                }
            ),
            { numRuns: 100 }
        );
    });
});
