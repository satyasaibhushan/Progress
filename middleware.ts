import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if user has a session cookie
  const sessionCookie = request.cookies.get("authjs.session-token") || request.cookies.get("__Secure-authjs.session-token")
  const isAuthenticated = !!sessionCookie

  const isAuthPage = pathname.startsWith("/auth/signin")

  // Redirect to signin if not authenticated (except on auth pages)
  if (!isAuthenticated && !isAuthPage) {
    const signInUrl = new URL("/auth/signin", request.url)
    signInUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Redirect to home if authenticated and trying to access signin
  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api/* (all API routes, including auth)
     * - /_next/static (static files)
     * - /_next/image (image optimization)
     * - /favicon.ico
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
}
