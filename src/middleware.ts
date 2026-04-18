import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host');
  const userAgent = request.headers.get('user-agent') || '';
  
  // 1. Canonical Redirect: Ensure use of www.rillcod.com
  // Only redirect in production environments where the host matches exactly
  if (host === 'rillcod.com') {
    const url = request.nextUrl.clone();
    url.host = 'www.rillcod.com';
    return NextResponse.redirect(url, 301);
  }

  // 2. Crawler Access: Allow Facebook and WhatsApp crawlers
  if (userAgent.includes('facebookexternalhit') || 
      userAgent.includes('Facebot') ||
      userAgent.includes('WhatsApp')) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
