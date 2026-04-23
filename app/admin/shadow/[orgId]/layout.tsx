import { auth, clerkClient } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ShadowNavLinks } from "@/components/shadow-nav-links"

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmail = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId
    )?.emailAddress
    const adminEmail = process.env.ADMIN_EMAIL || "mitch@mailmountains.com"
    return userEmail === adminEmail
  } catch {
    return false
  }
}

export default async function ShadowLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgId: string }>
}) {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    redirect("/servers")
  }

  const { orgId } = await params

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fixed shadow session banner */}
      <div className="fixed top-0 left-0 right-0 z-50 h-12 bg-orange-500 text-white flex items-center justify-between px-6 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-sm font-bold uppercase tracking-wide">Shadow Session</span>
          </span>
          <code className="bg-orange-600 text-orange-100 text-xs px-2 py-0.5 rounded font-mono">
            {orgId}
          </code>
        </div>
        <Link
          href="/admin/gondola"
          className="text-sm text-white hover:text-orange-100 border border-orange-300 hover:border-orange-100 px-3 py-1 rounded transition-colors"
        >
          Exit Shadow Mode
        </Link>
      </div>

      {/* Fixed left nav — mirrors real dashboard, adjusted for banner */}
      <ShadowNavLinks orgId={orgId} />

      {/* Page content — offset for banner */}
      <div className="pt-12">{children}</div>
    </div>
  )
}
