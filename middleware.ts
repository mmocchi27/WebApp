import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isProtectedRoute = createRouteMatcher([
  "/servers(.*)",
  "/checkout(.*)",
  "/user-management(.*)",
  "/billing(.*)",
  "/admin(.*)",
])

// Block obvious bot/attack paths
const blockedPatterns = [
  /\.php$/i,                    // All .php files
  /^\/wp-/i,                    // WordPress paths
  /^\/wordpress/i,              // WordPress
  /^\/admin\.php/i,             // Admin probes
  /^\/install\.php/i,           // Install probes
  /^\/vendor\//i,               // Vendor directory probes
  /^\/cgi-bin\//i,              // CGI probes
  /^\/\.env/i,                  // Environment file probes
  /^\/\.git/i,                  // Git directory probes
  /^\/\.well-known\/.*\.php/i,  // PHP in well-known
  /^\/phpmyadmin/i,             // phpMyAdmin probes
  /^\/mysql/i,                  // MySQL probes
  /^\/administrator/i,          // Joomla admin
  /^\/joomla/i,                 // Joomla
  /^\/drupal/i,                 // Drupal
  /^\/magento/i,                // Magento
  /^\/xmlrpc/i,                 // XML-RPC exploits
  /^\/config\./i,               // Config file probes
  /^\/backup/i,                 // Backup file probes
  /^\/db\./i,                   // Database file probes
  /shell/i,                     // Shell scripts
  /eval-stdin/i,                // Code injection
  // SEO spam bots
  /casino/i,                    // Casino spam
  /gambling/i,                  // Gambling spam
  /poker/i,                     // Poker spam
  /slot/i,                      // Slot machine spam
  /gclub/i,                     // Thai gambling
  /superslot/i,                 // Slot spam
  /goldluck/i,                  // Gambling spam
  /ufa-/i,                      // Thai gambling
  /bet.*win/i,                  // Betting spam
  /^\/[a-z]+\/www\./i,          // Spam pattern: /anything/www.domain
]

function isBlockedPath(path: string): boolean {
  return blockedPatterns.some(pattern => pattern.test(path))
}

export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname

  // Block malicious bot requests immediately
  if (isBlockedPath(path)) {
    // #region agent log
    console.log(`[DEBUG-BOT] Blocked malicious path: ${path}`)
    // #endregion
    return new NextResponse(null, { status: 404 })
  }

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
