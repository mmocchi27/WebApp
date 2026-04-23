"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ShadowSubscription {
  id: string
  subscriptionId: string
  serverName: string | null
  ipAddress: string | null
  status: string
  domainLimit: number
  inboxLimit: number
  createdAt: string
  stripeStatus: string | null
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean | null
}

interface BillingData {
  subscriptions: ShadowSubscription[]
  stripeCustomerId: string | null
  stripeCustomerEmail: string | null
}

function getStatusBadge(status: string) {
  const lower = status.toLowerCase()
  const colors =
    lower === "active"
      ? "bg-green-100 text-green-700"
      : lower === "pending"
      ? "bg-yellow-100 text-yellow-700"
      : lower === "unpaid"
      ? "bg-amber-100 text-amber-700"
      : lower === "past_due"
      ? "bg-orange-100 text-orange-700"
      : "bg-gray-100 text-gray-700"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors}`}>
      {status}
    </span>
  )
}

export default function ShadowBillingPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBilling = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/shadow/billing?orgId=${encodeURIComponent(orgId)}`)
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.error || "Failed to load billing data")
          return
        }
        setData(await res.json())
      } catch {
        setError("Failed to load billing data")
      } finally {
        setLoading(false)
      }
    }
    fetchBilling()
  }, [orgId])

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left sidebar spacer */}
      <div className="w-64 bg-white border-r border-gray-200 min-h-screen" />

      {/* Main content */}
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
                <path d="M4 24L12 12L20 18L28 8L32 16V24H4Z" fill="#1d4ed8" />
                <rect x="12" y="10" width="8" height="6" rx="1" fill="white" stroke="#1d4ed8" strokeWidth="0.5" />
                <path d="M12 11L16 13L20 11" stroke="#1d4ed8" strokeWidth="0.5" fill="none" />
              </svg>
              <span className="font-semibold text-gray-900">MailMountains</span>
            </div>
            <div className="flex items-center gap-4">
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>

          {/* Page Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Billing</h1>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading billing data...</p>
            </div>
          ) : (
            <>
              {/* Stripe customer info */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Billing Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-semibold text-blue-900 mb-2">In the billing portal the customer can:</h3>
                      <ul className="list-disc list-inside text-blue-800 space-y-1 text-sm">
                        <li>View and download invoices</li>
                        <li>Update payment methods</li>
                        <li>Update billing information</li>
                        <li>View subscription details</li>
                        <li>Manage their subscriptions</li>
                      </ul>
                    </div>

                    {data?.stripeCustomerId ? (
                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">Stripe Customer ID:</span>
                          <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">
                            {data.stripeCustomerId}
                          </code>
                        </div>
                        {data.stripeCustomerEmail && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">Customer Email:</span>
                            <span className="text-gray-600">{data.stripeCustomerEmail}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No Stripe customer found for this organization.</p>
                    )}

                    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-semibold">Shadow Mode</p>
                      <p>
                        The billing portal cannot be opened for another organization. This view is
                        read-only.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Subscriptions / servers */}
              <Card>
                <CardHeader>
                  <CardTitle>Servers</CardTitle>
                </CardHeader>
                <CardContent>
                  {!data?.subscriptions.length ? (
                    <p className="text-sm text-gray-500">No servers found for this organization.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.subscriptions.map((sub) => (
                        <div
                          key={sub.id}
                          className="p-3 rounded-md border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-gray-900">
                              {sub.serverName || "Unnamed server"}
                            </p>
                            <p className="text-xs text-gray-500">
                              ID: {sub.id.slice(0, 8).toUpperCase()}
                              {sub.ipAddress ? ` • IP: ${sub.ipAddress}` : ""}
                              {` • Domains: ${sub.domainLimit} • Inboxes: ${sub.inboxLimit}`}
                            </p>
                            {sub.subscriptionId && (
                              <p className="text-xs text-gray-400 font-mono">{sub.subscriptionId}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {getStatusBadge(sub.status)}
                            {sub.stripeStatus && sub.stripeStatus !== sub.status && (
                              <span className="text-xs text-gray-400">
                                Stripe: {sub.stripeStatus}
                              </span>
                            )}
                            {sub.currentPeriodEnd && (
                              <span className="text-xs text-gray-400">
                                Renews {new Date(sub.currentPeriodEnd * 1000).toLocaleDateString()}
                              </span>
                            )}
                            {sub.cancelAtPeriodEnd && (
                              <span className="text-xs text-red-500 font-medium">Cancels at period end</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
