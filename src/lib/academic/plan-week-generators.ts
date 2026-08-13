/**
 * In-process week generators — the same route handlers the UI hits, without
 * HTTP loopback. Self-fetch was why Prepare teaching returned empty weeks in
 * Cloudflare Containers: the server called production's URL, burned its budget,
 * and often got 401/404 before any lesson, slide, or assignment was written.
 */
import { NextRequest } from 'next/server';
import type { WeekContentType } from './auto-generate-settings';

type RouteHandler = (
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

const ROUTES: Record<WeekContentType, () => Promise<{ POST: RouteHandler }>> = {
  lessons: () => import('@/app/api/lesson-plans/[id]/generate-lessons/route'),
  slides: () => import('@/app/api/lesson-plans/[id]/generate-slides/route'),
  flashcards: () => import('@/app/api/lesson-plans/[id]/generate-flashcards/route'),
  assignments: () => import('@/app/api/lesson-plans/[id]/generate-assignments/route'),
  projects: () => import('@/app/api/lesson-plans/[id]/generate-projects/route'),
};

export async function invokePlanWeekGenerator(input: {
  planId: string;
  type: WeekContentType;
  week: number;
  session?: number | null;
  autoPublish?: boolean;
  cronSecret?: string;
  cookie?: string;
}): Promise<Response> {
  const mod = await ROUTES[input.type]();
  const autoPublish = input.autoPublish === true;
  const sessionRaw = Number(input.session);
  const session =
    Number.isFinite(sessionRaw) && sessionRaw > 0 ? Math.floor(sessionRaw) : null;
  const isJsonEndpoint = input.type === 'slides' || input.type === 'flashcards';

  const body = isJsonEndpoint
    ? {
        week: input.week,
        auto_publish: autoPublish,
        ...(session != null ? { session } : {}),
      }
    : {
        only_weeks: [input.week],
        max_weeks: 1,
        auto_publish: autoPublish,
        ...(session != null ? { only_session: session } : {}),
      };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (input.cronSecret) headers['x-cron-secret'] = input.cronSecret;
  if (input.cookie) headers.cookie = input.cookie;

  const req = new NextRequest(
    `http://internal/api/lesson-plans/${input.planId}/generate-${input.type}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
  );

  return mod.POST(req, { params: Promise.resolve({ id: input.planId }) });
}
