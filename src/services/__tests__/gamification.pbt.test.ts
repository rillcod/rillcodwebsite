// Feature: rillcod-web-improvements
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { gamificationService, ActivityType } from '../gamification.service';
import { createAdminClient } from '@/lib/supabase/admin';

// Awarding points writes with the service role, not the caller's session:
// point_transactions denies all writes by policy so a learner cannot award
// themselves any. Mocking only the session client left the real admin client in
// place, and the test tried to reach Supabase over the network.
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: vi.fn(),
}));

describe('GamificationService Property-Based Tests', () => {
    it('should be idempotent for (userId, activityType, referenceId) triple', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                // 'daily_login' is gone: it paid 10 points for opening the app,
                // was never awarded by any code path, and rewarded attendance
                // rather than learning.
                fc.constantFrom('lesson_complete', 'assignment_submit', 'quiz_pass', 'discussion_post' as ActivityType),
                fc.uuid(),
                async (userId, activityType, referenceId) => {
                    const mockSupabase = {
                        from: vi.fn().mockReturnThis(),
                        insert: vi.fn(),
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        // The points total is now summed from the ledger a page at a time, because
                        // PostgREST rejects points.sum() outright. A short page ends the loop.
                        range: vi.fn(),
                        single: vi.fn(),
                        upsert: vi.fn(),
                        // Discussion posts check how many were already paid for
                        // today before awarding, so the chain ends on gte().
                        gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
                    };

                    (createAdminClient as any).mockReturnValue(mockSupabase);

                    // First call: Successful insert
                    mockSupabase.insert.mockResolvedValueOnce({ count: 1, error: null });
                    mockSupabase.range.mockResolvedValueOnce({ data: [{ points: 10 }], error: null }); // step 2: ledger
                    mockSupabase.single
                        .mockResolvedValueOnce({ data: { achievement_level: 'Bronze' }, error: null }); // step 3: current points
                    mockSupabase.upsert.mockResolvedValueOnce({ error: null });

                    const result1 = await gamificationService.awardPoints(userId, activityType, referenceId);
                    expect(result1.awarded).toBe(true);

                    // Second call: Duplicate, count should be 0
                    mockSupabase.insert.mockResolvedValueOnce({ count: 0, error: null });
                    mockSupabase.range.mockResolvedValueOnce({ data: [{ points: 10 }], error: null }); // step 2: ledger
                    mockSupabase.single
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
