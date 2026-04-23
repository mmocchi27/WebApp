"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"

interface ShadowServer {
  id: string
  serverName: string | null
  ipAddress: string | null
  status: string
  domainLimit: number
  inboxLimit: number
  subscriptionId: string
}

interface ShadowInbox {
  id: string
  email: string
  domainName: string
  firstName: string
  lastName: string
  status: string
  createdAt: string
}

function getInboxStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          Active
        </span>
      )
    case "pending":
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          Pending
        </span>
      )
    case "failed":
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          Failed
        </span>
      )
    default:
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {status}
        </span>
      )
  }
}

export default function ShadowInboxesPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [servers, setServers] = useState<ShadowServer[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string>("")
  const [inboxes, setInboxes] = useState<ShadowInbox[]>([])
  const [loadingServers, setLoadingServers] = useState(true)
  const [loadingInboxes, setLoadingInboxes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const fetchServers = async () => {
      setLoadingServers(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/shadow/inboxes?orgId=${encodeURIComponent(orgId)}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || "Failed to load servers")
          return
        }
        const data = await res.json()
        setServers(data.servers || [])
        if (data.servers?.length > 0) {
          setSelectedServerId(data.servers[0].id)
        }
      } catch {
        setError("Failed to load servers")
      } finally {
        setLoadingServers(false)
      }
    }
    fetchServers()
  }, [orgId])

  useEffect(() => {
    if (!selectedServerId) return
    const fetchInboxes = async () => {
      setLoadingInboxes(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/admin/shadow/inboxes?orgId=${encodeURIComponent(orgId)}&serverId=${encodeURIComponent(selectedServerId)}`
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || "Failed to load inboxes")
          return
        }
        const data = await res.json()
        setInboxes(data.inboxes || [])
      } catch {
        setError("Failed to load inboxes")
      } finally {
        setLoadingInboxes(false)
      }
    }
    fetchInboxes()
  }, [selectedServerId, orgId])

  const selectedServer = servers.find((s) => s.id === selectedServerId)

  const filteredInboxes = search
    ? inboxes.filter(
        (i) =>
          i.email.toLowerCase().includes(search.toLowerCase()) ||
          i.domainName.toLowerCase().includes(search.toLowerCase()) ||
          `${i.firstName} ${i.lastName}`.toLowerCase().includes(search.toLowerCase())
      )
    : inboxes

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
            <h1 className="text-3xl font-bold text-gray-900">Inboxes</h1>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Server selector */}
          {!loadingServers && servers.length > 1 && (
            <div className="mb-6 flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Server:</span>
              <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Select a server" />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.serverName || "Unnamed server"}{" "}
                      {s.ipAddress ? `(${s.ipAddress})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {loadingServers ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading...</p>
            </div>
          ) : servers.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">No servers found for this organization.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle>
                    Inboxes{selectedServer ? ` — ${selectedServer.serverName || "Server"}` : ""}
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    {selectedServer && (
                      <span className="text-sm text-gray-500">
                        Limit: <strong>{selectedServer.inboxLimit}</strong>
                      </span>
                    )}
                    <Input
                      placeholder="Search inboxes..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-56"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingInboxes ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4" />
                    <p className="text-gray-600 text-sm">Loading inboxes...</p>
                  </div>
                ) : inboxes.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 text-sm">No inboxes on this server.</p>
                  </div>
                ) : (
                  <>
                    <div className="px-6 py-2 text-xs text-gray-500 border-b">
                      {filteredInboxes.length}{" "}
                      {filteredInboxes.length !== inboxes.length && `of ${inboxes.length} `}
                      inbox{inboxes.length !== 1 ? "es" : ""}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Domain</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInboxes.map((inbox) => (
                          <TableRow key={inbox.id} className="hover:bg-gray-50">
                            <TableCell className="font-mono text-sm">{inbox.email}</TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {inbox.firstName || inbox.lastName
                                ? `${inbox.firstName} ${inbox.lastName}`.trim()
                                : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {inbox.domainName}
                            </TableCell>
                            <TableCell>{getInboxStatusBadge(inbox.status)}</TableCell>
                            <TableCell className="text-sm text-gray-500">
                              {new Date(inbox.createdAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
