"use client"

import { usePathname } from "next/navigation"
import { useRouter } from "next/navigation"

interface ShadowNavLinksProps {
  orgId: string
}

const bottomLinks = [
  { label: "Billing", segment: "billing" },
  { label: "User Management", segment: "user-management" },
]

export function ShadowNavLinks({ orgId }: ShadowNavLinksProps) {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (segment: string) =>
    pathname === `/admin/shadow/${orgId}/${segment}` ||
    pathname.startsWith(`/admin/shadow/${orgId}/${segment}/`)

  const navBtn = (label: string, segment: string) => {
    const active = isActive(segment)
    return (
      <button
        key={segment}
        onClick={() => router.push(`/admin/shadow/${orgId}/${segment}`)}
        className={`px-6 py-3 rounded-md font-medium shadow-lg w-[200px] text-left transition-colors ${
          active
            ? "bg-orange-500 hover:bg-orange-600 text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="fixed top-20 left-8 z-40 flex flex-col gap-4">
      {bottomLinks.map(({ label, segment }) => navBtn(label, segment))}
    </div>
  )
}
