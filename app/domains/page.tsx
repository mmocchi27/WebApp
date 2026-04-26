"use client"

import { useOrganization, OrganizationSwitcher } from "@clerk/nextjs"
import { UserButton } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useRef, useEffect } from "react"
import { NavSidebar } from "@/components/nav-sidebar"

const Logo = ({ onClick }: { onClick: () => void }) => (
  <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={onClick}>
    <svg width="32" height="24" viewBox="0 0 32 24" className="flex-shrink-0">
      <path d="M0 24L8 8L16 16L24 4L32 20V24H0Z" fill="#2563eb" opacity="0.8" />
      <path d="M4 24L12 12L20 18L28 8L32 16V24H4Z" fill="#1d4ed8" />
      <rect x="12" y="10" width="8" height="6" rx="1" fill="white" stroke="#1d4ed8" strokeWidth="0.5" />
      <path d="M12 11L16 13L20 11" stroke="#1d4ed8" strokeWidth="0.5" fill="none" />
    </svg>
    <span className="font-semibold text-gray-900">MailMountains</span>
  </div>
)

export default function DomainsPage() {
  const { organization, isLoaded } = useOrganization()
  const router = useRouter()
  const lastOrgIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (organization) {
      if (lastOrgIdRef.current && lastOrgIdRef.current !== organization.id) {
        window.location.reload()
      }
      lastOrgIdRef.current = organization.id
    }
  }, [organization?.id])

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="w-64 bg-white border-r border-gray-200 min-h-screen" />

      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <Logo onClick={() => router.push("/")} />
            <div className="flex items-center gap-4">
              <OrganizationSwitcher
                hidePersonal={true}
                afterSelectOrganizationUrl="/domains"
                afterCreateOrganizationUrl="/domains"
              />
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>

          {/* Page Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Domains</h1>
            <p className="text-gray-600 mt-2">Manage your domain configurations</p>
          </div>

        </div>
      </div>

      <NavSidebar />
    </div>
  )
}
