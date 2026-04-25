"use client"

import { useUser, useOrganization, OrganizationSwitcher } from "@clerk/nextjs"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useRef, useEffect } from "react"

export default function Dashboard() {
  const { user } = useUser()
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
            <div
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push("/")}
            >
              <svg width="32" height="24" viewBox="0 0 32 24" className="flex-shrink-0">
                <path d="M0 24L8 8L16 16L24 4L32 20V24H0Z" fill="#2563eb" opacity="0.8" />
                <path d="M4 24L12 12L20 18L28 8L32 16V24H0Z" fill="#1d4ed8" />
                <rect x="12" y="10" width="8" height="6" rx="1" fill="white" stroke="#1d4ed8" strokeWidth="0.5" />
                <path d="M12 11L16 13L20 11" stroke="#1d4ed8" strokeWidth="0.5" fill="none" />
              </svg>
              <span className="font-semibold text-gray-900">MailMountains</span>
            </div>
            <div className="flex items-center gap-4">
              <OrganizationSwitcher
                hidePersonal={true}
                afterSelectOrganizationUrl="/dashboard"
                afterCreateOrganizationUrl="/dashboard"
              />
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>

          {/* Welcome */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome{user?.firstName ? `, ${user.firstName}` : ""}
            </h1>
            {organization && (
              <p className="text-gray-500 mt-2">{organization.name}</p>
            )}
          </div>

        </div>
      </div>

      {/* Left Nav */}
      <div className="fixed bottom-8 left-8 flex flex-col gap-4">
        <Button
          onClick={() => router.push("/billing")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
        >
          Billing
        </Button>
        <Button
          onClick={() => router.push("/user-management")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
        >
          User Management
        </Button>
      </div>
    </div>
  )
}
