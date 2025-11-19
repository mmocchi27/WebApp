import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isProtectedRoute = createRouteMatcher([
  "/servers(.*)",
  "/checkout(.*)",
  "/user-management(.*)",
  "/billing(.*)",
  "/admin(.*)",
])

export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedRoute(req)) await auth.protect()
  },
  {
    publicRoutes: ["/api/webhooks/stripe(.*)", "/sign-in(.*)", "/sign-up(.*)"],
  }
)

export const config = {
  matcher: [
    "/servers/:path*",
    "/checkout/:path*",
    "/user-management/:path*",
    "/billing/:path*",
    "/admin/:path*",
  ],
}
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isProtectedRoute = createRouteMatcher([
  "/servers(.*)",
  "/checkout(.*)",
  "/user-management(.*)",
  "/billing(.*)",
  "/admin(.*)",
])

export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedRoute(req)) await auth.protect()
  },
  {
    publicRoutes: ["/api/webhooks/stripe(.*)", "/sign-in(.*)", "/sign-up(.*)"],
  }
)

export const config = {
  matcher: [
    "/servers/:path*",
    "/checkout/:path*",
    "/user-management/:path*",
    "/billing/:path*",
    "/admin/:path*",
  ],
}
