import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isProtectedRoute = createRouteMatcher(["/servers(.*)", "/checkout(.*)", "/user-management(.*)", "/billing(.*)", "/admin(.*)"])
const isWebhookRoute = createRouteMatcher(["/api/webhooks(.*)"])
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])

export default clerkMiddleware(async (auth, req) => {
  // Skip authentication for webhook routes and auth routes
  if (isWebhookRoute(req) || isAuthRoute(req)) {
    return
  }
  
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and webhook routes
    "/((?!_next|api/webhooks|[^?]*.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes (except Clerk internal routes which are handled automatically)
    "/(api|trpc)(.*)",
  ],
}
