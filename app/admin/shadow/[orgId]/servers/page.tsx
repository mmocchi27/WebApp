"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ShadowServer {
  id: string
  subscriptionId: string
  organizationId: string
  serverName: string | null
  ipAddress: string | null
  status: string
  domainLimit: number
  inboxLimit: number
  createdAt: string
}

function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return "text-green-600 bg-green-100"
    case "pending":
      return "text-yellow-600 bg-yellow-100"
    case "unpaid":
      return "text-amber-600 bg-amber-100"
    case "suspended":
    case "cancelled":
    case "canceled":
      return "text-red-600 bg-red-100"
    default:
      return "text-gray-600 bg-gray-100"
  }
}

export default function ShadowServersPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [servers, setServers] = useState<ShadowServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchServers = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/shadow/servers?orgId=${encodeURIComponent(orgId)}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || "Failed to load servers")
          return
        }
        const data = await res.json()
        setServers(data.servers || [])
      } catch {
        setError("Failed to load servers")
      } finally {
        setLoading(false)
      }
    }
    fetchServers()
  }, [orgId])

  const activeServers = servers.filter(
    (s) => !["cancelled", "canceled"].includes(s.status.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <div className="w-64 bg-white border-r border-gray-200 min-h-screen" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading servers...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left sidebar spacer (nav provided by layout) */}
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
            <h1 className="text-3xl font-bold text-gray-900">Servers</h1>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Card>
            <CardContent>
              {activeServers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No active servers found for this organization.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Table Header */}
                  <div className="grid grid-cols-3 gap-4 px-4 py-3 bg-gray-50 rounded-md font-medium text-sm text-gray-700">
                    <div className="text-center">Server Name</div>
                    <div className="text-center">Status</div>
                    <div className="text-center">IP Address</div>
                  </div>

                  {activeServers.map((server) => (
                    <div
                      key={server.id}
                      className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-gray-200 items-center"
                    >
                      <div className="text-center text-gray-600">
                        {server.serverName || (
                          <span className="text-gray-400 italic">Unnamed server</span>
                        )}
                      </div>
                      <div className="text-center">
                        {server.status.toLowerCase() === "pending" ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(server.status)} cursor-help`}
                                >
                                  {server.status}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Waiting for MailMountains team to assign an IP address.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(server.status)}`}
                          >
                            {server.status}
                          </span>
                        )}
                      </div>
                      <div className="text-gray-600 text-center">
                        {server.ipAddress || "Not assigned"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cancelled servers (collapsed) */}
          {servers.filter((s) =>
            ["cancelled", "canceled"].includes(s.status.toLowerCase())
          ).length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-sm text-gray-500">
                  Cancelled Servers (
                  {
                    servers.filter((s) =>
                      ["cancelled", "canceled"].includes(s.status.toLowerCase())
                    ).length
                  }
                  )
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {servers
                    .filter((s) => ["cancelled", "canceled"].includes(s.status.toLowerCase()))
                    .map((server) => (
                      <div
                        key={server.id}
                        className="flex items-center justify-between px-4 py-2 bg-red-50 rounded text-sm"
                      >
                        <span className="text-gray-700">
                          {server.serverName || "Unnamed server"}
                        </span>
                        <span className="text-xs text-red-600 font-medium">Cancelled</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
