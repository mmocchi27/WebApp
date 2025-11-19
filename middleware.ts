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
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes (except Clerk internal routes which are handled automatically)
    "/(api|trpc)(.*)",
  ],
}
