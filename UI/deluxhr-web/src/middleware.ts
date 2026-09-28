import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedRoutes = [
  '/dashboard',
  '/ceo-dashboard',
  '/employees',
  '/departments',
  '/leave-types',
  '/leave-requests',
  '/audit-log',
  '/attendance',
  '/timesheets',
  '/earnings',
  '/payroll-runs',
  '/payslips',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // read token from cookie
  const token = request.cookies.get('deluxhr_token')?.value;

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  const isAuthPage = pathname === '/login' || pathname === '/register';

  // 🚫 Not logged in → block protected pages
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 🔁 Already logged in → don't allow login/register again
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/employees/:path*',
    '/departments/:path*',
    '/leave-types/:path*',
    '/leave-requests/:path*',
    '/audit-log/:path*',
    '/login',
    '/register',
    '/attendance/:path*',
    '/timesheets/:path*',
    '/earnings/:path*',
    '/payroll-runs/:path*',
    '/payslips/:path*',
    '/ceo-dashboard/:path*',
  ],
};