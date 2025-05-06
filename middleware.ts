import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Exclude public routes from authentication check
  const publicRoutes = ['/', '/login'];
  const isPublicRoute = publicRoutes.some(route => 
    request.nextUrl.pathname === route || 
    request.nextUrl.pathname.startsWith('/api/auth')
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get('session');
  
  // If no session cookie, redirect to login
  if (!sessionCookie) {
    // Redirect to home page without query parameters
    const loginUrl = new URL('/', request.url);
    // Store the intended destination in a cookie instead of query param
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set('redirectAfterLogin', request.nextUrl.pathname, {
      path: '/',
      maxAge: 60 * 10, // 10 minutes
      httpOnly: true,
      sameSite: 'lax'
    });
    return response;
  }

  return NextResponse.next();
}

// Match all routes except public assets
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (API routes for authentication)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 