export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: ["/((?!api|mcp|\\.well-known|_next/static|_next/image|favicon.ico).*)"],
};
