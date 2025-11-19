import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isProtectedRoute = createRouteMatcher([
  "/servers(.*)",
  "/checkout(.*)",
  "/user-management(.*)",
  "/billing(.*)",
  "/admin(.*)",
])

export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname

  // Allow Stripe webhooks (and sign-in/up) to bypass Clerk auth
  if (
    path.startsWith("/api/webhooks/stripe") ||
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up")
  ) {
    return
  }

  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    "/((?!_next|api/webhooks/stripe|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
}
