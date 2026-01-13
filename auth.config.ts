import type { NextAuthConfig } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

// Auth config without Prisma (for middleware - Edge Runtime compatible)
export const authConfig = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnSignIn = nextUrl.pathname.startsWith("/auth/signin")

      if (isOnSignIn) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl))
        return true
      }

      return isLoggedIn
    },
  },
} satisfies NextAuthConfig
