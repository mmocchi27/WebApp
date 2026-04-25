import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

// ONLY match your actual protected routes (not random paths with similar names)
const isProtectedRoute = createRouteMatcher([
  "/dashboard",
  "/dashboard/(.*)",
  "/checkout",
  "/checkout/(.*)",
  "/user-management",
  "/user-management/(.*)",
  "/billing",
  "/billing/(.*)",
  "/admin/gondola",
  "/admin/gondola/(.*)",
  "/admin/shadow",
  "/admin/shadow/(.*)",
])

// Valid paths in your app - everything else gets 404
const validPathPatterns = [
  /^\/$/,                       // Homepage
  /^\/dashboard/,               // Dashboard
  /^\/checkout/,                // Checkout page
  /^\/billing/,                 // Billing page
  /^\/user-management/,         // User management
  /^\/admin\/gondola/,          // Admin gondola (your actual admin)
  /^\/admin\/shadow/,           // Admin shadow session
  /^\/sign-in/,                 // Sign in
  /^\/sign-up/,                 // Sign up
  /^\/api\//,                   // API routes
  /^\/robots\.txt$/,            // Robots.txt
  /^\/favicon\.ico$/,           // Favicon
  /^\/icon\.svg$/,              // Icon
]

function isValidPath(path: string): boolean {
  return validPathPatterns.some(pattern => pattern.test(path))
}

export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname

  // FIRST: Block any path that's not in our app (stops bots immediately)
  if (!isValidPath(path)) {
    // #region agent log
    console.log(`[DEBUG-BOT] Blocked unknown path: ${path}`)
    // #endregion
    return new NextResponse(null, { status: 404 })
  }

  // #region agent log
  console.log(`[DEBUG-A] Middleware entry: path=${path}, method=${req.method}`)
  // #endregion

  // Allow webhooks and sign-in/up to bypass Clerk auth
  if (
    path.startsWith("/api/webhooks/clerk") ||
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
