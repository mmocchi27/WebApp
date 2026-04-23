"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { ChevronDown } from "lucide-react"
import { Fragment } from "react"

interface ShadowServer {
  id: string
  serverName: string | null
  ipAddress: string | null
  status: string
  domainLimit: number
  inboxLimit: number
  subscriptionId: string
}

interface ShadowDomain {
  id: string
  domain_name: string
  cloudflareStatus: string
  dnsConfigured: boolean
  nameservers: string[] | null
  masterDomain: string | null
  redirectConfigured: boolean
  mxRecord: string | null
  spfRecord: string | null
  dmarcRecord: string | null
  dkimRecord: string | null
  inboxCount: number
  createdAt: string
  active: number
}

function cloudflareStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
    case "pending":
      return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Pending</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

export default function ShadowDomainsPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [servers, setServers] = useState<ShadowServer[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string>("")
  const [domains, setDomains] = useState<ShadowDomain[]>([])
  const [loadingServers, setLoadingServers] = useState(true)
  const [loadingDomains, setLoadingDomains] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const fetchServers = async () => {
      setLoadingServers(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/shadow/domains?orgId=${encodeURIComponent(orgId)}`)
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
    const fetchDomains = async () => {
      setLoadingDomains(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/admin/shadow/domains?orgId=${encodeURIComponent(orgId)}&serverId=${encodeURIComponent(selectedServerId)}`
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || "Failed to load domains")
          return
        }
        const data = await res.json()
        setDomains(data.domains || [])
      } catch {
        setError("Failed to load domains")
      } finally {
        setLoadingDomains(false)
      }
    }
    fetchDomains()
  }, [selectedServerId, orgId])

  const selectedServer = servers.find((s) => s.id === selectedServerId)

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
            <h1 className="text-3xl font-bold text-gray-900">Domains</h1>
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
                <div className="flex items-center justify-between">
                  <CardTitle>
                    Domains{selectedServer ? ` — ${selectedServer.serverName || "Server"}` : ""}
                  </CardTitle>
                  {selectedServer && (
                    <div className="flex gap-4 text-sm text-gray-500">
                      <span>
                        Limit:{" "}
                        <strong>{selectedServer.domainLimit}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingDomains ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4" />
                    <p className="text-gray-600 text-sm">Loading domains...</p>
                  </div>
                ) : domains.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 text-sm">No domains on this server.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domain</TableHead>
                        <TableHead>Cloudflare</TableHead>
                        <TableHead>DNS</TableHead>
                        <TableHead>Master Domain</TableHead>
                        <TableHead>Redirect</TableHead>
                        <TableHead>Inboxes</TableHead>
                        <TableHead>Added</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {domains.map((domain) => {
                        const isExpanded = expandedId === domain.id
                        const nameserverList = Array.isArray(domain.nameservers)
                          ? domain.nameservers.filter((ns): ns is string => typeof ns === "string")
                          : []
                        return (
                          <Fragment key={domain.id}>
                            <TableRow className="hover:bg-gray-50">
                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(isExpanded ? null : domain.id)}
                                  className="flex items-center gap-2 font-mono text-left text-gray-900 hover:text-blue-600"
                                >
                                  <span>{domain.domain_name}</span>
                                  <ChevronDown
                                    className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  />
                                </button>
                              </TableCell>
                              <TableCell>{cloudflareStatusBadge(domain.cloudflareStatus)}</TableCell>
                              <TableCell>
                                {domain.dnsConfigured ? (
                                  <span className="text-green-600 text-sm font-medium">Yes</span>
                                ) : (
                                  <span className="text-gray-400 text-sm">No</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-gray-600">
                                {domain.masterDomain || "—"}
                              </TableCell>
                              <TableCell>
                                {domain.redirectConfigured ? (
                                  <span className="text-green-600 text-xs font-medium">Yes</span>
                                ) : (
                                  <span className="text-gray-400 text-xs">No</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {domain.inboxCount}
                              </TableCell>
                              <TableCell className="text-sm text-gray-500">
                                {new Date(domain.createdAt).toLocaleDateString()}
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow className="bg-gray-50">
                                <TableCell colSpan={7} className="px-6 py-4">
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    {nameserverList.length > 0 && (
                                      <div className="sm:col-span-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                                          Nameservers
                                        </p>
                                        <ul className="list-disc list-inside space-y-1">
                                          {nameserverList.map((ns) => (
                                            <li key={ns} className="font-mono text-sm">{ns}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {[
                                      { label: "MX Record", value: domain.mxRecord },
                                      { label: "SPF Record", value: domain.spfRecord },
                                      { label: "DKIM Record", value: domain.dkimRecord },
                                      { label: "DMARC Record", value: domain.dmarcRecord },
                                    ].map(({ label, value }) => (
                                      <div key={label}>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                          {label}
                                        </p>
                                        <p className="font-mono text-sm break-all text-gray-700">
                                          {value || "Not set"}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
