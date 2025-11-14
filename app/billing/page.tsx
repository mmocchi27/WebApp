"use client"

import { useUser, useOrganization, OrganizationSwitcher } from "@clerk/nextjs"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

export default function Billing() {
  const { user } = useUser()
  const { organization } = useOrganization()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [lastOrgId, setLastOrgId] = useState<string | null>(null)

  // Force page refresh when org changes
  useEffect(() => {
    if (organization && lastOrgId && organization.id !== lastOrgId) {
      window.location.reload()
    }
    if (organization) {
      setLastOrgId(organization.id)
    }
  }, [organization?.id])

  const handleOpenPortal = async () => {
    setLoading(true)
    setError("")

    try {
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/billing`
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Redirect to Stripe Customer Portal
        window.location.href = data.url
      } else {
        setError(data.error || 'Failed to open billing portal')
        setLoading(false)
      }
    } catch (error) {
      console.error('Error opening portal:', error)
      setError('Failed to open billing portal. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 min-h-screen" />
      
      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              {/* Logo and Title */}
              <div
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => router.push("/")}
              >
                <svg width="32" height="24" viewBox="0 0 32 24" className="flex-shrink-0">
                  {/* Mountains */}
                  <path d="M0 24L8 8L16 16L24 4L32 20V24H0Z" fill="#2563eb" opacity="0.8" />
                  <path d="M4 24L12 12L20 18L28 8L32 16V24H4Z" fill="#1d4ed8" />
                  {/* Mail icon in the center */}
                  <rect x="12" y="10" width="8" height="6" rx="1" fill="white" stroke="#1d4ed8" strokeWidth="0.5" />
                  <path d="M12 11L16 13L20 11" stroke="#1d4ed8" strokeWidth="0.5" fill="none" />
                </svg>
                <span className="font-semibold text-gray-900">MailMountains</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button
                onClick={() => router.push("/servers")}
                variant="outline"
              >
                Back to Servers
              </Button>
              <div className="flex items-center gap-4">
                <OrganizationSwitcher 
                  hidePersonal={true}
                  afterSelectOrganizationUrl="/billing"
                  afterCreateOrganizationUrl="/billing"
                />
                <UserButton afterSignOutUrl="/" />
              </div>
            </div>
          </div>

          {/* Page Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Billing</h1>
          </div>

          {/* Content */}
          <Card>
            <CardHeader>
              <CardTitle>Manage Your Billing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <p className="text-gray-600 mb-4">
                    Access your billing portal to manage your subscriptions, payment methods, and view your invoice history.
                  </p>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-blue-900 mb-2">In the billing portal you can:</h3>
                    <ul className="list-disc list-inside text-blue-800 space-y-1">
                      <li>View and download invoices</li>
                      <li>Update payment methods</li>
                      <li>Update billing information</li>
                      <li>View subscription details</li>
                      <li>Manage your subscriptions</li>
                    </ul>
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                      <p className="text-red-800">{error}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleOpenPortal}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Opening Portal...
                      </>
                    ) : (
                      'Open Billing Portal'
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top Left Navigation Buttons */}
      <div className="fixed top-8 left-8 flex flex-col gap-4">
        <Button
          onClick={() => router.push("/servers")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
        >
          Servers
        </Button>
        <Button
          onClick={() => router.push("/domains")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
        >
          Domains
        </Button>
      </div>

      {/* Bottom Left Buttons */}
      <div className="fixed bottom-8 left-8 flex flex-col gap-4">
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
          disabled
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

