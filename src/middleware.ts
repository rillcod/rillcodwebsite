import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';
  
  // Allow Facebook's crawler (facebookexternalhit) to access all pages
  if (userAgent.includes('facebookexternalhit') || 
      userAgent.includes('Facebot') ||
      userAgent.includes('WhatsApp')) {
    return NextResponse.next();
  }

  // Your existing middleware logic here
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
