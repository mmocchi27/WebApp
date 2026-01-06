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

  // #region agent log
  console.log(`[DEBUG-A] Middleware entry: path=${path}, method=${req.method}`)
  // #endregion

  // Allow Stripe webhooks (and sign-in/up) to bypass Clerk auth
  if (
    path.startsWith("/api/webhooks/stripe") ||
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up")
  ) {
    // #region agent log
    console.log(`[DEBUG-A] Bypassing auth for path=${path}`)
    // #endregion
    return
  }

  if (isProtectedRoute(req)) {
    // #region agent log
    console.log(`[DEBUG-A] Protected route - calling auth.protect() for path=${path}`)
    // #endregion
    try {
      await auth.protect()
      // #region agent log
      console.log(`[DEBUG-A] auth.protect() SUCCESS for path=${path}`)
      // #endregion
    } catch (err: any) {
      // #region agent log
      console.log(`[DEBUG-A] auth.protect() FAILED for path=${path}, error=${err?.message||String(err)}`)
      // #endregion
      throw err
    }
  }

  // #region agent log
  console.log(`[DEBUG-A] Middleware complete for path=${path}`)
  // #endregion
})

export const config = {
  matcher: [
    "/((?!_next|api/webhooks/stripe|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
}
