"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ShadowMember {
  id: string
  role: string
  createdAt: number
  firstName: string
  lastName: string
  identifier: string
  userId: string
}

interface ShadowInvitation {
  id: string
  emailAddress: string
  role: string
  createdAt: number
  expiresAt: number | null
}

interface UsersData {
  org: { id: string; name: string }
  members: ShadowMember[]
  pendingInvitations: ShadowInvitation[]
}

export default function ShadowUserManagementPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [data, setData] = useState<UsersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/shadow/users?orgId=${encodeURIComponent(orgId)}`)
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.error || "Failed to load users")
          return
        }
        setData(await res.json())
      } catch {
        setError("Failed to load users")
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
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
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading users...</p>
            </div>
          ) : !data ? null : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{data.org.name} — Members</CardTitle>
                    <span className="text-sm text-gray-500">{data.members.length} member{data.members.length !== 1 ? "s" : ""}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {data.members.length === 0 ? (
                    <p className="text-sm text-gray-500">No members found.</p>
                  ) : (
                    <div className="space-y-4">
                      {/* Table Header */}
                      <div className="grid grid-cols-4 gap-4 px-4 py-3 bg-gray-50 rounded-md font-medium text-sm text-gray-700">
                        <div>Name</div>
                        <div>Email</div>
                        <div>Role</div>
                        <div>Joined</div>
                      </div>

                      {data.members.map((member) => (
                        <div
                          key={member.id}
                          className="grid grid-cols-4 gap-4 px-4 py-3 border-b border-gray-200 items-center"
                        >
                          <div className="font-medium text-gray-900">
                            {member.firstName || member.lastName
                              ? `${member.firstName} ${member.lastName}`.trim()
                              : "—"}
                          </div>
                          <div className="text-gray-600 text-sm truncate">{member.identifier || "—"}</div>
                          <div>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                member.role === "org:admin"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {member.role.replace("org:", "")}
                            </span>
                          </div>
                          <div className="text-gray-500 text-sm">
                            {new Date(member.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pending Invitations */}
                  {data.pendingInvitations.length > 0 && (
                    <div className="mt-8 pt-8 border-t border-gray-200">
                      <h3 className="text-lg font-semibold mb-4">
                        Pending Invitations ({data.pendingInvitations.length})
                      </h3>
                      <div className="space-y-2">
                        {data.pendingInvitations.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-md"
                          >
                            <div>
                              <p className="font-medium text-gray-900">{inv.emailAddress}</p>
                              <p className="text-sm text-gray-500">
                                Invited as {inv.role.replace("org:", "")} •{" "}
                                Sent {new Date(inv.createdAt).toLocaleDateString()}
                                {inv.expiresAt && (
                                  <> • Expires {new Date(inv.expiresAt).toLocaleDateString()}</>
                                )}
                              </p>
                            </div>
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                              Pending
                            </span>
                          </div>
                        ))}
                      </div>
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
