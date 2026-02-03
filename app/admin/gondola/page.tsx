"use client"

import { useUser, useOrganization, OrganizationSwitcher } from "@clerk/nextjs"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, FormEvent, Fragment } from "react"

interface Server {
  id: string
  subscriptionId: string
  organizationId: string
  serverName: string | null
  ipAddress: string | null
  apiKey: string | null
  hostname: string | null
  status: string
  domainLimit: number
  inboxLimit: number
  blacklistStatus?: string | null
  blacklistSeverity?: string | null
  blacklistLastChecked?: string | null
  blacklists?: Array<{
    blacklist: string
    blacklist_name: string
    blacklist_url: string
    blacklist_severity: string
  }> | null
  createdAt: string
  updatedAt: string
}

interface DomainRecord {
  id: string
  domainName: string
  cloudflareStatus: string
  dnsConfigured: boolean
  nameservers: string[] | null
  mxRecord: string | null
  spfRecord: string | null
  dmarcRecord: string | null
  dkimRecord: string | null
  createdAt: string
  updatedAt: string
}

interface InboxRecord {
  id: string
  email: string
  domainName: string
  status: string
  createdAt: string
  updatedAt: string
}

interface SubscriptionDetailsPayload {
  server: {
    id: string
    subscriptionId: string
    organizationId: string
    serverName: string | null
    status: string
  }
  domains: DomainRecord[]
  inboxes: InboxRecord[]
}

type ServerFormState = {
  serverName: string
  ipAddress: string
  apiKey: string
  hostname: string
  status: string
  domainLimit: string
  inboxLimit: string
}

type EditableField =
  | 'serverName'
  | 'ipAddress'
  | 'apiKey'
  | 'hostname'
  | 'status'
  | 'domainLimit'
  | 'inboxLimit'

export default function AdminGondola() {
  const { user, isLoaded } = useUser()
  const { organization } = useOrganization()
  const router = useRouter()
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(false)
  const lastOrgIdRef = useRef<string | null>(null)
  const [formData, setFormData] = useState<Record<string, ServerFormState>>({})
  const [queryOrgId, setQueryOrgId] = useState("")
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [orgInputError, setOrgInputError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [tableError, setTableError] = useState<string | null>(null)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [subscriptionDetails, setSubscriptionDetails] = useState<SubscriptionDetailsPayload | null>(null)
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null)
  const [detailsNotice, setDetailsNotice] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null)
  const [exportingNameservers, setExportingNameservers] = useState(false)
  const [exportingInboxes, setExportingInboxes] = useState<"Instantly" | "Smartlead" | null>(null)
  const [checkingDomainStatus, setCheckingDomainStatus] = useState(false)
  const [checkingIPStatus, setCheckingIPStatus] = useState<string | null>(null)
  const [clearingServer, setClearingServer] = useState<string | null>(null)

  // Force page refresh when org changes
  useEffect(() => {
    if (organization) {
      if (lastOrgIdRef.current && lastOrgIdRef.current !== organization.id) {
        window.location.reload()
      }
      lastOrgIdRef.current = organization.id
    }
  }, [organization?.id])

  // Check if user is admin
  useEffect(() => {
    if (isLoaded && user) {
      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'mitch@mailmountains.com'
      const userEmail = user.primaryEmailAddress?.emailAddress
      
      if (userEmail !== adminEmail) {
        // Not an admin, redirect to servers page
        router.push('/servers')
        return
      }
    }
  }, [isLoaded, user, router])

  const fetchServers = async (query: string) => {
    setLoading(true)
    setFetchError(null)
    setTableError(null)
    setHasSearched(true)

    try {
      // Determine if it's an org ID (starts with org_), subscription ID (starts with sub_), or IP address
      const isSubscriptionId = query.startsWith('sub_')
      const isIPAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(query.trim())
      
      let url: string
      if (isSubscriptionId) {
        url = `/api/admin/servers?subscriptionId=${encodeURIComponent(query)}`
      } else if (isIPAddress) {
        url = `/api/admin/servers?ipAddress=${encodeURIComponent(query)}`
      } else {
        url = `/api/admin/servers?orgId=${encodeURIComponent(query)}`
      }
      
      const response = await fetch(url)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        setServers([])
        setFormData({})
        setFetchError(errorData.error || "Failed to fetch servers")
        return
      }

      const data = await response.json()
      const filteredServers: Server[] = (data.servers || []).filter((server: Server) => {
        const normalizedStatus = server.status?.toLowerCase()
        return normalizedStatus === 'active' || normalizedStatus === 'pending' || normalizedStatus === 'suspended'
      })

      setServers(filteredServers)

      const nextFormData: Record<string, ServerFormState> = {}
      filteredServers.forEach((server: Server) => {
        nextFormData[server.id] = {
          serverName: server.serverName || '',
          ipAddress: server.ipAddress || '',
          apiKey: server.apiKey || '',
          hostname: server.hostname || '',
          status: server.status,
          domainLimit: String(server.domainLimit ?? 34),
          inboxLimit: String(server.inboxLimit ?? 102),
        }
      })
      setFormData(nextFormData)
    } catch (error) {
      console.error('Error fetching servers:', error)
      setServers([])
      setFormData({})
      setFetchError("Failed to fetch servers")
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (
    serverId: string,
    subscriptionId: string,
    organizationId: string,
    overrideValues?: ServerFormState
  ) => {
    const currentValues =
      overrideValues ||
      formData[serverId] || {
        serverName: '',
        ipAddress: '',
        apiKey: '',
        hostname: '',
        status: 'pending',
        domainLimit: '34',
        inboxLimit: '102',
      }

    const parsedDomainLimit = parseInt(currentValues.domainLimit, 10)
    const parsedInboxLimit = parseInt(currentValues.inboxLimit, 10)

    try {
      const response = await fetch('/api/admin/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionId,
          organizationId,
          serverName: currentValues.serverName,
          ipAddress: currentValues.ipAddress,
          apiKey: currentValues.apiKey,
          hostname: currentValues.hostname,
          status: currentValues.status,
          domainLimit: Number.isFinite(parsedDomainLimit) && parsedDomainLimit > 0 ? parsedDomainLimit : undefined,
          inboxLimit: Number.isFinite(parsedInboxLimit) && parsedInboxLimit > 0 ? parsedInboxLimit : undefined,
        }),
      })

      if (response.ok) {
        setTableError(null)
        await fetchServers(organizationId)
        return true
      } else {
        const errorData = await response.json()
        console.error('Server update error:', errorData)
        setTableError(errorData.details || errorData.error || 'Failed to update server')
        return false
      }
    } catch (error) {
      console.error('Error updating server:', error)
      setTableError('Failed to update server. Please try again.')
      return false
    }
  }

  const handleChange = (serverId: string, field: EditableField, value: string) => {
    setFormData(prev => ({
      ...prev,
      [serverId]: {
        ...prev[serverId],
        [field]: value
      }
    }))
  }

  const handleFieldCommit = async (serverId: string, field: EditableField, nextValue?: string) => {
    const server = servers.find((s) => s.id === serverId)
    if (!server) return

    const existingValues = formData[serverId] || {
      serverName: server.serverName || '',
      ipAddress: server.ipAddress || '',
      apiKey: server.apiKey || '',
      hostname: server.hostname || '',
      status: server.status,
      domainLimit: String(server.domainLimit ?? 34),
      inboxLimit: String(server.inboxLimit ?? 102),
    }

    const updatedValues: ServerFormState = {
      ...existingValues,
      ...(nextValue !== undefined ? { [field]: nextValue } : {}),
    } as ServerFormState

    const serverValueRaw = server[field as keyof Server]
    const currentServerValue =
      serverValueRaw === null || serverValueRaw === undefined
        ? ''
        : typeof serverValueRaw === 'number'
        ? String(serverValueRaw)
        : String(serverValueRaw)
    const pendingValue = (updatedValues[field] || '').trim()

    if (currentServerValue === pendingValue) {
      return
    }

    const fieldKey = `${serverId}-${field}`
    setSavingField(fieldKey)
    await handleUpdate(server.id, server.subscriptionId, server.organizationId, updatedValues)
    setSavingField(null)
  }

  const resetDetailsState = () => {
    setSubscriptionDetails(null)
    setDetailsError(null)
    setDetailsLoading(false)
    setSelectedSubscriptionId(null)
    setDetailsNotice(null)
    setExpandedDomainId(null)
    setExportingNameservers(false)
    setExportingInboxes(null)
  }

  const fetchSubscriptionDetails = async (subscriptionId: string) => {
    setDetailsLoading(true)
    setDetailsError(null)

    try {
      const response = await fetch(`/api/admin/subscription-details?subscriptionId=${encodeURIComponent(subscriptionId)}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        setSubscriptionDetails(null)
        setDetailsError(errorData.error || "Failed to load subscription details")
        return
      }

      const data: SubscriptionDetailsPayload = await response.json()
      setSubscriptionDetails(data)
    } catch (error) {
      console.error("Error fetching subscription details:", error)
      setSubscriptionDetails(null)
      setDetailsError("Failed to load subscription details")
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleOpenSubscriptionDetails = (subscriptionId: string) => {
    setSelectedSubscriptionId(subscriptionId)
    setDetailsDialogOpen(true)
    setDetailsNotice(null)
    setExpandedDomainId(null)
    setExportingNameservers(false)
    setExportingInboxes(null)
    fetchSubscriptionDetails(subscriptionId)
  }

  const handleDetailsDialogChange = (open: boolean) => {
    setDetailsDialogOpen(open)
    if (!open) {
      resetDetailsState()
    }
  }

  const toggleDomainExpansion = (domainId: string) => {
    setExpandedDomainId((prev) => (prev === domainId ? null : domainId))
  }

  const handleExportNameservers = () => {
    if (typeof window === "undefined") return
    if (!subscriptionDetails || subscriptionDetails.domains.length === 0) return

    setExportingNameservers(true)
    try {
      const csvRows = ["Domain,Nameserver 1,Nameserver 2"]
      subscriptionDetails.domains.forEach((domain) => {
        const nameservers = Array.isArray(domain.nameservers) ? domain.nameservers : []
        const ns1 = nameservers[0] || ""
        const ns2 = nameservers[1] || ""
        csvRows.push(`${domain.domainName},${ns1},${ns2}`)
      })

      const csvContent = csvRows.join("\n")
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `nameservers-${new Date().toISOString().split("T")[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      setDetailsNotice({ type: "success", text: "Nameservers exported." })
    } catch (error) {
      console.error("Error exporting nameservers:", error)
      setDetailsNotice({ type: "error", text: "Failed to export nameservers." })
    } finally {
      setExportingNameservers(false)
    }
  }

  const handleCheckDomainStatus = async () => {
    if (!subscriptionDetails || !subscriptionDetails.server || subscriptionDetails.domains.length === 0) return

    setCheckingDomainStatus(true)
    setDetailsNotice(null)

    try {
      // Check each domain one at a time
      let updatedCount = 0
      let errorCount = 0

      for (const domain of subscriptionDetails.domains) {
        try {
          const response = await fetch('/api/domains/check-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              serverId: subscriptionDetails.server.id,
              domainId: domain.id
            })
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            console.error(`Error checking ${domain.domainName}:`, errorData)
            errorCount++
            continue
          }

          const data = await response.json()
          if (data.updated > 0) {
            updatedCount += data.updated
          }

          // Small delay between requests to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (error) {
          console.error(`Error checking ${domain.domainName}:`, error)
          errorCount++
        }
      }

      // Refresh the subscription details to show updated status
      await fetchSubscriptionDetails(subscriptionDetails.server.subscriptionId)

      if (errorCount > 0) {
        setDetailsNotice({ 
          type: "error", 
          text: `Status check completed with ${errorCount} error(s). ${updatedCount} domain(s) updated.` 
        })
      } else {
        setDetailsNotice({ 
          type: "success", 
          text: `Status check completed. ${updatedCount} domain(s) updated.` 
        })
      }
    } catch (error) {
      console.error("Error checking domain status:", error)
      setDetailsNotice({ type: "error", text: "Failed to check domain status. Please try again." })
    } finally {
      setCheckingDomainStatus(false)
    }
  }

  const handleCheckIPStatus = async (serverId: string) => {
    setCheckingIPStatus(serverId)
    setTableError(null)

    try {
      const response = await fetch('/api/admin/check-ip-blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        setTableError(errorData.error || errorData.message || 'Failed to check IP blacklist status')
        return
      }

      const data = await response.json()
      
      // Refresh servers to show updated status
      if (currentOrgId) {
        await fetchServers(currentOrgId)
      }

      if (data.blacklistResult?.status === 'Blacklisted') {
        setTableError(`⚠️ IP is blacklisted: ${data.blacklistResult.blacklists?.length || 0} blacklist(s) found (${data.blacklistResult.blacklistSeverity || 'Unknown'} severity)`)
      } else {
        setTableError(null)
      }
    } catch (error) {
      console.error('Error checking IP status:', error)
      setTableError('Failed to check IP blacklist status. Please try again.')
    } finally {
      setCheckingIPStatus(null)
    }
  }

  const handleClearServer = async (serverId: string, serverName: string | null) => {
    console.log('handleClearServer called with:', { serverId, serverName })
    
    const confirmed = window.confirm(
      `Are you sure you want to clear all domains and inboxes from server "${serverName || serverId}"?\n\nThis will:\n- Delete all domains from Cloudflare and MailCow\n- Delete all inboxes from MailCow\n- Remove all domain and inbox records from the database\n\nThis action cannot be undone.`
    )

    if (!confirmed) {
      console.log('User cancelled the confirmation')
      return
    }

    setClearingServer(serverId)
    setTableError(null)

    try {
      console.log('Sending request to /api/admin/clear-server with serverId:', serverId)
      const response = await fetch('/api/admin/clear-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverId }),
      })

      console.log('Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Error response:', errorData)
        setTableError(errorData.error || 'Failed to clear server')
        return
      }

      const data = await response.json()
      console.log('Success response:', data)

      // Refresh servers to show updated state
      if (currentOrgId) {
        console.log('Refreshing servers with currentOrgId:', currentOrgId)
        await fetchServers(currentOrgId)
      } else {
        console.log('No currentOrgId, skipping refresh')
      }

      setTableError(null)
    } catch (error) {
      console.error('Error clearing server:', error)
      setTableError('Failed to clear server. Please try again.')
    } finally {
      setClearingServer(null)
    }
  }

  const handleExportInboxes = async (destination: "Instantly" | "Smartlead") => {
    if (typeof window === "undefined") return
    if (!subscriptionDetails?.server?.id) return

    setDetailsNotice(null)
    setExportingInboxes(destination)

    try {
      const response = await fetch("/api/inboxes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: subscriptionDetails.server.id,
          destination,
        }),
      })

      if (!response.ok) {
        let errorMessage = "Failed to export inboxes."
        try {
          const data = await response.json()
          errorMessage = data.message || data.error || errorMessage
        } catch {
          // ignore parse errors
        }
        setDetailsNotice({ type: "error", text: errorMessage })
        return
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get("Content-Disposition") || ""
      const match = contentDisposition.match(/filename="(.+)"/)
      const filename = match ? match[1] : `inboxes-${destination.toLowerCase()}.csv`

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      setDetailsNotice({ type: "success", text: `Export generated for ${destination}.` })
    } catch (error: any) {
      console.error("Error exporting inboxes:", error)
      setDetailsNotice({
        type: "error",
        text: error?.message || "Failed to export inboxes.",
      })
    } finally {
      setExportingInboxes(null)
    }
  }

  const handleQuerySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!queryOrgId.trim()) {
      setOrgInputError("Organization ID, Subscription ID, or IP Address is required")
      return
    }

    if (!isLoaded || !user) {
      setOrgInputError("Please wait for your session to finish loading.")
      return
    }

    const normalizedQuery = queryOrgId.trim()
    setOrgInputError(null)
    setCurrentOrgId(normalizedQuery)
    fetchServers(normalizedQuery)
  }

  const handleClearQuery = () => {
    setQueryOrgId("")
    setCurrentOrgId(null)
    setServers([])
    setFormData({})
    setHasSearched(false)
    setOrgInputError(null)
    setFetchError(null)
    setTableError(null)
    setSavingField(null)
    setDetailsDialogOpen(false)
    resetDetailsState()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
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
            </div>
          </div>
          <div className="flex items-center gap-4">
            <OrganizationSwitcher 
              hidePersonal={true}
              afterSelectOrganizationUrl="/admin/gondola"
              afterCreateOrganizationUrl="/admin/gondola"
            />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        {/* Page Title */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Gondola</h1>
        </div>

        {/* Org Lookup */}
        <Tabs defaultValue="org" className="mb-8 flex flex-col items-center">
          <TabsList>
            <TabsTrigger value="org">Search</TabsTrigger>
          </TabsList>
          <TabsContent value="org" className="w-full max-w-3xl">
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleQuerySubmit} className="flex flex-col gap-4 md:flex-row md:items-end">
                  <div className="flex-1">
                    <Label htmlFor="orgId">Organization ID, Subscription ID, or IP Address</Label>
                    <Input
                      id="orgId"
                      placeholder="org_35fvmZQfMIl9YuY6mFJ13r9Bq8o, sub_1ABC..., or 192.168.1.1"
                      value={queryOrgId}
                      onChange={(e) => setQueryOrgId(e.target.value)}
                      autoComplete="off"
                    />
                    {orgInputError && (
                      <p className="text-sm text-red-600 mt-2">{orgInputError}</p>
                    )}
                  </div>
                  <div className="flex gap-2 md:self-end">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {loading ? 'Searching...' : 'Search'}
                    </Button>
                    {hasSearched && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleClearQuery}
                        disabled={loading}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {hasSearched && (
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading servers...</p>
                </div>
              ) : fetchError ? (
                <div className="py-12 text-center">
                  <p className="text-red-600">{fetchError}</p>
                </div>
              ) : servers.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-gray-500">No active, pending, or suspended servers found for {currentOrgId || 'your search'}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-[100px]">ID</th>
                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-[120px]">Sub ID</th>
                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-[120px]">Org ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">API Key</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hostname</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domain Limit</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inbox Limit</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Blacklist Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated At</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {servers.map((server) => (
                        <tr key={server.id} className="hover:bg-gray-50">
                          <td className="px-2 py-3 text-xs font-mono text-gray-900 break-all max-w-[100px]">{server.id}</td>
                          <td className="px-2 py-3 text-xs font-mono text-gray-900 break-all max-w-[120px]">
                            <button
                              type="button"
                              onClick={() => handleOpenSubscriptionDetails(server.subscriptionId)}
                              className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
                            >
                              {server.subscriptionId}
                            </button>
                          </td>
                          <td className="px-2 py-3 text-xs font-mono text-gray-900 break-all max-w-[120px]">{server.organizationId}</td>
                          <td className="px-4 py-3 text-sm">
                            <Input
                              value={formData[server.id]?.serverName ?? ''}
                              onChange={(e) => handleChange(server.id, 'serverName', e.target.value)}
                              onBlur={(e) => void handleFieldCommit(server.id, 'serverName', e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  e.currentTarget.blur()
                                }
                              }}
                              placeholder="Server name"
                              className="w-full"
                              disabled={savingField === `${server.id}-serverName`}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <Input
                              value={formData[server.id]?.ipAddress ?? ''}
                              onChange={(e) => handleChange(server.id, 'ipAddress', e.target.value)}
                              onBlur={(e) => void handleFieldCommit(server.id, 'ipAddress', e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  e.currentTarget.blur()
                                }
                              }}
                              placeholder="192.168.1.1"
                              className="w-full font-mono"
                              disabled={savingField === `${server.id}-ipAddress`}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <Input
                              value={formData[server.id]?.apiKey ?? ''}
                              onChange={(e) => handleChange(server.id, 'apiKey', e.target.value)}
                              onBlur={(e) => void handleFieldCommit(server.id, 'apiKey', e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  e.currentTarget.blur()
                                }
                              }}
                              placeholder="sk_..."
                              className="w-full font-mono"
                              type="password"
                              autoComplete="off"
                              disabled={savingField === `${server.id}-apiKey`}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <Input
                              value={formData[server.id]?.hostname ?? ''}
                              onChange={(e) => handleChange(server.id, 'hostname', e.target.value)}
                              onBlur={(e) => void handleFieldCommit(server.id, 'hostname', e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  e.currentTarget.blur()
                                }
                              }}
                              placeholder="mail.example.com"
                              className="w-full font-mono"
                              disabled={savingField === `${server.id}-hostname`}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <select
                              value={formData[server.id]?.status || 'pending'}
                              onChange={(e) => {
                                handleChange(server.id, 'status', e.target.value)
                                void handleFieldCommit(server.id, 'status', e.target.value)
                              }}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                              disabled={savingField === `${server.id}-status`}
                            >
                              <option value="pending">Pending</option>
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <Input
                              type="number"
                              min={1}
                              value={formData[server.id]?.domainLimit ?? '34'}
                              onChange={(e) => handleChange(server.id, 'domainLimit', e.target.value)}
                              onBlur={(e) => void handleFieldCommit(server.id, 'domainLimit', e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  e.currentTarget.blur()
                                }
                              }}
                              className="w-full"
                              disabled={savingField === `${server.id}-domainLimit`}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <Input
                              type="number"
                              min={1}
                              value={formData[server.id]?.inboxLimit ?? '102'}
                              onChange={(e) => handleChange(server.id, 'inboxLimit', e.target.value)}
                              onBlur={(e) => void handleFieldCommit(server.id, 'inboxLimit', e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  e.currentTarget.blur()
                                }
                              }}
                              className="w-full"
                              disabled={savingField === `${server.id}-inboxLimit`}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {server.ipAddress ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  {server.blacklistStatus === 'Blacklisted' ? (
                                    <span className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800">
                                      ⚠️ Blacklisted
                                    </span>
                                  ) : server.blacklistStatus === 'Not blacklisted' ? (
                                    <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-800">
                                      ✓ Clean
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-600">
                                      Not checked
                                    </span>
                                  )}
                                  {server.blacklistSeverity && (
                                    <span className="text-xs text-gray-500">
                                      ({server.blacklistSeverity})
                                    </span>
                                  )}
                                </div>
                                {server.blacklistLastChecked && (
                                  <p className="text-xs text-gray-500">
                                    Last checked: {new Date(server.blacklistLastChecked).toLocaleString()}
                                  </p>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleCheckIPStatus(server.id)}
                                  disabled={checkingIPStatus === server.id || !server.ipAddress}
                                  className="mt-1 text-xs"
                                >
                                  {checkingIPStatus === server.id ? 'Checking...' : 'Check IP Status'}
                                </Button>
                                {server.blacklists && server.blacklists.length > 0 && (
                                  <details className="mt-1">
                                    <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                                      View {server.blacklists.length} blacklist{server.blacklists.length !== 1 ? 's' : ''}
                                    </summary>
                                    <ul className="mt-1 ml-4 text-xs text-gray-600 space-y-1">
                                      {server.blacklists.map((bl, idx) => (
                                        <li key={idx}>
                                          <a
                                            href={bl.blacklist_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                          >
                                            {bl.blacklist_name}
                                          </a>
                                          {bl.blacklist_severity && (
                                            <span className="text-gray-500 ml-1">({bl.blacklist_severity})</span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">No IP configured</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{new Date(server.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{new Date(server.updatedAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                handleClearServer(server.id, server.serverName).catch((error) => {
                                  console.error('Error in handleClearServer:', error)
                                  setTableError('Failed to clear server. Please try again.')
                                })
                              }}
                              disabled={clearingServer === server.id}
                              className="text-xs"
                            >
                              {clearingServer === server.id ? 'Clearing...' : 'Clear Server'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
            {tableError && (
              <div className="px-6 py-4 border-t text-sm text-red-600">
                {tableError}
              </div>
            )}
          </Card>
        )}
      </div>

      <Dialog open={detailsDialogOpen} onOpenChange={handleDetailsDialogChange}>
        <DialogContent className="sm:max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Subscription {selectedSubscriptionId || ""}</DialogTitle>
            <DialogDescription>
              Domains and inboxes currently attached to this subscription.
            </DialogDescription>
          </DialogHeader>
          {detailsLoading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 text-sm">Loading details...</p>
            </div>
          ) : detailsError ? (
            <p className="text-sm text-red-600">{detailsError}</p>
          ) : subscriptionDetails ? (
            <div className="space-y-6">
              <div className="grid gap-1 text-sm">
                <p>
                  <span className="font-semibold">Server:</span>{" "}
                  {subscriptionDetails.server.serverName || "Untitled"}
                </p>
                <p>
                  <span className="font-semibold">Organization ID:</span>{" "}
                  {subscriptionDetails.server.organizationId}
                </p>
                <p>
                  <span className="font-semibold">Status:</span>{" "}
                  {subscriptionDetails.server.status}
                </p>
              </div>

              {detailsNotice && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    detailsNotice.type === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-green-200 bg-green-50 text-green-700"
                  }`}
                >
                  {detailsNotice.text}
                </div>
              )}

              <div>
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Domains ({subscriptionDetails.domains.length})
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCheckDomainStatus}
                      disabled={
                        checkingDomainStatus || subscriptionDetails.domains.length === 0
                      }
                    >
                      {checkingDomainStatus ? "Checking..." : "Check Status"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportNameservers}
                      disabled={
                        exportingNameservers || subscriptionDetails.domains.length === 0 || checkingDomainStatus
                      }
                    >
                      {exportingNameservers ? "Exporting..." : "Export Nameservers"}
                    </Button>
                  </div>
                </div>
                {subscriptionDetails.domains.length === 0 ? (
                  <p className="text-sm text-gray-500">No domains linked to this subscription.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                            Domain
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                            Status
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                            DNS Configured
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                            Added
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {subscriptionDetails.domains.map((domain) => {
                          const nameserverList = Array.isArray(domain.nameservers)
                            ? domain.nameservers.filter(
                                (ns): ns is string => typeof ns === "string" && ns.length > 0
                              )
                            : []
                          const isExpanded = expandedDomainId === domain.id
                          return (
                            <Fragment key={domain.id}>
                              <tr className="hover:bg-gray-50">
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleDomainExpansion(domain.id)}
                                    className="flex w-full items-center justify-between gap-2 font-mono text-left text-gray-900"
                                    aria-expanded={isExpanded}
                                  >
                                    <span className="truncate">{domain.domainName}</span>
                                    <ChevronDown
                                      className={`h-4 w-4 text-gray-500 transition-transform ${
                                        isExpanded ? "rotate-180" : ""
                                      }`}
                                    />
                                  </button>
                                </td>
                                <td className="px-3 py-2 capitalize">{domain.cloudflareStatus}</td>
                                <td className="px-3 py-2">{domain.dnsConfigured ? "Yes" : "No"}</td>
                                <td className="px-3 py-2 text-gray-500">
                                  {new Date(domain.createdAt).toLocaleString()}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-gray-50">
                                  <td colSpan={4} className="px-4 py-4 text-sm">
                                    <div className="flex flex-col gap-4">
                                      <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                          Nameservers
                                        </p>
                                        {nameserverList.length ? (
                                          <ul className="mt-2 list-disc space-y-1 pl-5">
                                            {nameserverList.map((ns) => (
                                              <li key={ns} className="font-mono text-sm break-all">
                                                {ns}
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className="mt-2 text-sm text-gray-500">
                                            No nameservers recorded yet.
                                          </p>
                                        )}
                                      </div>
                                      <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            MX Record
                                          </p>
                                          <p className="font-mono text-sm break-all">
                                            {domain.mxRecord || "Not set"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            SPF Record
                                          </p>
                                          <p className="font-mono text-sm break-all">
                                            {domain.spfRecord || "Not set"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            DKIM Record
                                          </p>
                                          <p className="font-mono text-sm break-all">
                                            {domain.dkimRecord || "Not set"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            DMARC Record
                                          </p>
                                          <p className="font-mono text-sm break-all">
                                            {domain.dmarcRecord || "Not set"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Cloudflare Status
                                          </p>
                                          <p className="text-sm capitalize">
                                            {domain.cloudflareStatus || "Unknown"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            DNS Configured
                                          </p>
                                          <p className="text-sm">{domain.dnsConfigured ? "Yes" : "No"}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Inboxes ({subscriptionDetails.inboxes.length})
                  </h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          subscriptionDetails.inboxes.length === 0 || exportingInboxes !== null
                        }
                      >
                        {exportingInboxes
                          ? `Exporting ${exportingInboxes}...`
                          : "Export Inboxes"}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={exportingInboxes !== null}
                        onSelect={(event) => {
                          event.preventDefault()
                          handleExportInboxes("Instantly")
                        }}
                      >
                        Instantly
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={exportingInboxes !== null}
                        onSelect={(event) => {
                          event.preventDefault()
                          handleExportInboxes("Smartlead")
                        }}
                      >
                        Smartlead
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {subscriptionDetails.inboxes.length === 0 ? (
                  <p className="text-sm text-gray-500">No inboxes linked to this subscription.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                            Email
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                            Domain
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                            Status
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                            Created
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {subscriptionDetails.inboxes.map((inbox) => (
                          <tr key={inbox.id}>
                            <td className="px-3 py-2 font-mono">{inbox.email}</td>
                            <td className="px-3 py-2">{inbox.domainName}</td>
                            <td className="px-3 py-2 capitalize">{inbox.status}</td>
                            <td className="px-3 py-2 text-gray-500">
                              {new Date(inbox.createdAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Select a subscription to view its details.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

