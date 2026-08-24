import { NextResponse } from 'next/server';

/**
 * Compatibility boundary for clients that still call the retired Gradebook
 * batch builder. Result preparation now belongs exclusively to Academic
 * Auto-fill, which supplies the class offering/period identity and invokes the
 * central evidence calculator. Do not add calculation or report writes here.
 */
export async function POST() {
  return NextResponse.json({
    error: 'Report preparation has moved to Auto-fill so every result uses the same class evidence and reporting period.',
    action_label: 'Open Auto-fill',
    action_href: '/dashboard/academic/results',
  }, { status: 410 });
}
