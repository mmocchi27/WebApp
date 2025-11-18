"use client"

import { useUser, UserButton, useOrganization, OrganizationSwitcher } from "@clerk/nextjs"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"

interface Subscription {
  id: string
  subscriptionId: string
  status: string
  currentPeriodEnd: string
  serverName?: string
}

const MAX_DOMAINS_PER_SERVER = 34

interface Domain {
  id?: string
  domain_name: string
  active: string | number
  cloudflareStatus?: string
  cloudflareZoneId?: string
  nameservers?: string[]
  dnsConfigured?: boolean
  masterDomain?: string
  redirectConfigured?: boolean
  mxRecord?: string
  spfRecord?: string
  dmarcRecord?: string
  dkimRecord?: string
  lastCheckedAt?: string
  inboxCount?: number
  [key: string]: any // MailCow returns various other fields
}

interface RedirectResult {
  domain: string
  status: "configured" | "skipped" | "error"
  success: boolean
  message?: string
}

export default function Domains() {
  const { user } = useUser()
  const { organization, isLoaded: orgLoaded } = useOrganization()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [openingBilling, setOpeningBilling] = useState(false)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string>("")
  const [domains, setDomains] = useState<Domain[]>([])
  const [loadingDomains, setLoadingDomains] = useState(false)
  const [domainsError, setDomainsError] = useState<string>("")
  const [checkingDns, setCheckingDns] = useState(false)
  const [checkingDomainIds, setCheckingDomainIds] = useState<Set<string>>(new Set())
  const [dnsRecords, setDnsRecords] = useState<{[domain: string]: any}>({})
  const [dnsError, setDnsError] = useState<string>("")
  const [exportingCsv, setExportingCsv] = useState(false)
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)
  const [showAddDomainModal, setShowAddDomainModal] = useState(false)
  const [domainList, setDomainList] = useState("")
  const [addingDomains, setAddingDomains] = useState(false)
  const [addedDomains, setAddedDomains] = useState<{domain: string, nameservers: string[], status: string, message?: string, cloudflareStatus?: string}[]>([])
  const [addDomainError, setAddDomainError] = useState("")
  const [currentlyAdding, setCurrentlyAdding] = useState("")
  const [masterDomain, setMasterDomain] = useState("")
  const [configuringMasterDomain, setConfiguringMasterDomain] = useState(false)
  const [masterDomainError, setMasterDomainError] = useState("")
  const [masterDomainResults, setMasterDomainResults] = useState<RedirectResult[]>([])
  const [skipRedirectConfirmed, setSkipRedirectConfirmed] = useState(false)
  const [showDeleteDomainModal, setShowDeleteDomainModal] = useState(false)
  const [selectedDomainsToDelete, setSelectedDomainsToDelete] = useState<Set<string>>(new Set())
  const [deletingDomains, setDeletingDomains] = useState(false)
  const lastOrgIdRef = useRef<string | null>(null)
  const successfulAddedDomains = addedDomains.filter(item => item.status === 'success')
  const successfulAddedDomainNames = successfulAddedDomains.map(item => item.domain)

  // Force page refresh when org changes
  useEffect(() => {
    if (organization) {
      if (lastOrgIdRef.current && lastOrgIdRef.current !== organization.id) {
        window.location.reload()
      }
      lastOrgIdRef.current = organization.id
    }
  }, [organization?.id])

  useEffect(() => {
    if (user && orgLoaded) {
      if (organization) {
        fetchSubscriptions()
      } else {
        setLoading(false)
      }
    }
  }, [user, organization, orgLoaded])

  // Fetch domains when selectedServerId changes
  useEffect(() => {
    if (selectedServerId) {
      fetchDomains()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServerId])

  const storageKey = organization?.id ? `selectedServer_${organization.id}` : null
  useEffect(() => {
    if (!storageKey || selectedServerId) return
    if (typeof window !== "undefined") {
      const storedId = localStorage.getItem(storageKey)
      if (storedId) {
        setSelectedServerId(storedId)
      }
    }
  }, [storageKey, selectedServerId])


  useEffect(() => {
    if (!storageKey) return
    if (selectedServerId) {
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, selectedServerId)
      }
    } else if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey)
    }
  }, [selectedServerId, storageKey])

  const fetchSubscriptions = async () => {
    try {
      const response = await fetch("/api/subscriptions")
      if (response.ok) {
        const data = await response.json()
        // Filter out cancelled subscriptions
        const activeSubscriptions = data.subscriptions.filter(
          (sub: Subscription) => sub.status !== "cancelled"
        )
        setSubscriptions(activeSubscriptions)
        setSelectedServerId(prevId => {
          if (prevId && activeSubscriptions.some(sub => sub.id === prevId)) {
            return prevId
          }
          if (storageKey && typeof window !== "undefined") {
            const storedId = localStorage.getItem(storageKey)
            if (storedId && activeSubscriptions.some(sub => sub.id === storedId)) {
              return storedId
            }
          }
          return activeSubscriptions.length > 0 ? activeSubscriptions[0].id : ""
        })
      }
    } catch (error) {
      console.error("Error fetching subscriptions:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDomains = async () => {
    setLoadingDomains(true)
    setDomainsError("")
    setDomains([])
    setDnsRecords({}) // Clear DNS records when switching servers
    
    try {
      const response = await fetch(`/api/domains?serverId=${selectedServerId}`)
      const data = await response.json()
      
      if (response.ok) {
        setDomains(data.domains || [])
      } else {
        setDomainsError(data.message || data.error || "Failed to fetch domains")
      }
    } catch (error) {
      console.error("Error fetching domains:", error)
      setDomainsError("Failed to connect to server")
    } finally {
      setLoadingDomains(false)
    }
  }

  const checkDnsRecords = async (returnRecords = false) => {
    if (domains.length === 0) {
      setDnsError("No domains to check")
      return returnRecords ? null : undefined
    }

    setCheckingDns(true)
    setDnsError("")
    
    try {
      const domainNames = domains.map(d => d.domain_name)
      const response = await fetch('/api/domains/check-dns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domains: domainNames,
          serverId: selectedServerId
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setDnsRecords(data.records || {})
        return returnRecords ? (data.records || {}) : undefined
      } else {
        setDnsError(data.message || data.error || "Failed to check DNS records")
        return returnRecords ? null : undefined
      }
    } catch (error) {
      console.error("Error checking DNS records:", error)
      setDnsError("Failed to check DNS records")
      return returnRecords ? null : undefined
    } finally {
      setCheckingDns(false)
    }
  }

  const checkNameserverStatus = async () => {
    if (domains.length === 0) {
      setDnsError("No domains to check")
      return
    }

    setCheckingDns(true)
    setDnsError("")
    
    let updatedCount = 0
    const statusCounts: Record<string, number> = {}
    
    // Process each domain one at a time
    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i]
      console.log(`🔄 Starting check for domain ${i + 1}/${domains.length}: ${domain.domain_name}`)
      
      // Add this domain to the "checking" set
      setCheckingDomainIds(prev => {
        const newSet = new Set(prev)
        newSet.add(domain.id!)
        console.log(`  Added ${domain.id} to checking set. Set size: ${newSet.size}`)
        return newSet
      })
      
      // Small delay to ensure state update is processed
      await new Promise(resolve => setTimeout(resolve, 100))
      
      try {
        const response = await fetch('/api/domains/check-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serverId: selectedServerId,
            domainId: domain.id
          })
        })
        
        const data = await response.json()
        console.log(`  ✅ Completed check for ${domain.domain_name}`, data)
        
        if (response.ok && data.updated > 0) {
          updatedCount += data.updated
        }
        
        // Update this specific domain in state with the new data
        if (response.ok && data.results && data.results.length > 0) {
          const result = data.results[0]
          if (result.status) {
            statusCounts[result.status] = (statusCounts[result.status] || 0) + 1
          }
          setDomains(prevDomains => 
            prevDomains.map(d => 
              d.id === domain.id 
                ? {
                    ...d,
                    cloudflareStatus: result.status,
                    nameservers: result.nameservers,
                    mxRecord: result.mxRecord,
                    spfRecord: result.spfRecord,
                    dmarcRecord: result.dmarcRecord,
                    dkimRecord: result.dkimRecord,
                    dnsConfigured: result.dnsConfigured,
                    redirectConfigured: result.redirectConfigured
                  }
                : d
            )
          )
        } else {
          statusCounts["error"] = (statusCounts["error"] || 0) + 1
        }
        
      } catch (error) {
        console.error(`  ❌ Error checking ${domain.domain_name}:`, error)
      } finally {
        // Remove this domain from the "checking" set
        setCheckingDomainIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(domain.id!)
          console.log(`  Removed ${domain.id} from checking set. Set size: ${newSet.size}`)
          return newSet
        })
        
        // Small delay before next domain
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    // Show success message
    if (updatedCount > 0) {
      const updatedMessage =
        updatedCount === 1
          ? "✓ Status updated for 1 domain"
          : `✓ Status updated for ${updatedCount} domains`
      setDnsError(updatedMessage)
    } else {
      const totalChecked = domains.length
      const pendingCount = statusCounts["pending"] || 0

      if (pendingCount === totalChecked && totalChecked > 0) {
        const pendingMessage =
          totalChecked === 1
            ? "Checked 1 domain. Cloudflare still reports it as pending nameserver verification. Update the registrar nameservers or wait for propagation."
            : `Checked ${totalChecked} domains. Cloudflare still reports them as pending nameserver verification. Update the registrar nameservers or wait for propagation.`
        setDnsError(pendingMessage)
      } else {
        setDnsError("")
      }
    }
    
    // Clear message after 5 seconds
    setTimeout(() => setDnsError(""), 5000)
    
    setCheckingDns(false)
  }

  const handleAddDomains = async () => {
    if (!domainList.trim() || addingDomains) {
      return
    }

    setMasterDomainResults([])
    setMasterDomainError("")
    setSkipRedirectConfirmed(false)

    // Parse domains from textarea (split by newlines, commas, or spaces)
    const domainsToAttempt = domainList
      .split(/[\n,\s]+/)
      .map(d => d.trim())
      .filter(d => d.length > 0)

    if (domainsToAttempt.length === 0) {
      setAddDomainError("Please enter at least one domain")
      return
    }

    const existingDomainNames = new Set(
      domains.map((d) => d.domain_name.toLowerCase())
    )
    const seenInputDomains = new Set<string>()
    const duplicateInInput: string[] = []
    const duplicateExisting: string[] = []
    const uniqueDomainsToAttempt: string[] = []

    domainsToAttempt.forEach((rawDomain) => {
      const normalized = rawDomain.toLowerCase()
      if (seenInputDomains.has(normalized)) {
        duplicateInInput.push(rawDomain)
        return
      }
      if (existingDomainNames.has(normalized)) {
        duplicateExisting.push(rawDomain)
        return
      }
      seenInputDomains.add(normalized)
      uniqueDomainsToAttempt.push(rawDomain)
    })

    if (duplicateInInput.length > 0) {
      setAddDomainError(
        `Remove duplicate domain(s) before proceeding: ${duplicateInInput.join(", ")}`
      )
      return
    }

    if (duplicateExisting.length > 0) {
      setAddDomainError(
        `These domains already exist on this server: ${duplicateExisting.join(", ")}. Remove duplicates before proceeding.`
      )
      return
    }

    const currentDomainCount = domains.length
    const slotsRemaining = Math.max(0, MAX_DOMAINS_PER_SERVER - currentDomainCount)

    if (slotsRemaining === 0) {
      setAddDomainError("purchase another server to add more domains")
      return
    }

    const domainsToProcess = uniqueDomainsToAttempt.slice(0, slotsRemaining)
    const overflowDomains = uniqueDomainsToAttempt.slice(slotsRemaining)
    const reachedLimitThisRun = overflowDomains.length > 0

    setAddingDomains(true)
    setAddDomainError(reachedLimitThisRun ? "purchase another server to add more domains" : "")
    setAddedDomains([])

    // Process each domain
    for (const domain of domainsToProcess) {
      setCurrentlyAdding(domain)
      
      try {
        const response = await fetch('/api/domains/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            domain: domain,
            serverId: selectedServerId
          })
        })

        const data = await response.json()

        if (response.ok) {
          // Add to the list of added domains with nameservers
          setAddedDomains(prev => [...prev, {
            domain: domain,
            nameservers: data.nameservers || [],
            status: 'success',
            cloudflareStatus: data.cloudflareStatus || 'pending'
          }])
        } else {
          setAddedDomains(prev => [...prev, {
            domain: domain,
            nameservers: [],
            status: 'error',
            message: data.message || data.error
          }])
        }
      } catch (error) {
        console.error("Error adding domain:", error)
        setAddedDomains(prev => [...prev, {
          domain: domain,
          nameservers: [],
          status: 'error',
          message: "Failed to add domain"
        }])
      }
    }

    setCurrentlyAdding("")
    setAddingDomains(false)
    setDomainList("")

    if (overflowDomains.length > 0) {
      setAddedDomains(prev => [
        ...prev,
        ...overflowDomains.map(domain => ({
          domain,
          nameservers: [],
          status: "error",
          message: "purchase another server to add more domains",
        })),
      ])
    }

    // Refresh the domains list
    fetchDomains()
  }

  const handleConfigureMasterDomain = async () => {
    const trimmedMasterDomain = masterDomain.trim().toLowerCase()

    if (!trimmedMasterDomain) {
      setMasterDomainError("Please enter a master domain")
      return
    }

    if (!selectedServerId) {
      setMasterDomainError("Select a server before configuring redirects")
      return
    }

    if (successfulAddedDomainNames.length === 0) {
      setMasterDomainError("Add at least one domain successfully before configuring redirects")
      return
    }

    setConfiguringMasterDomain(true)
    setMasterDomainError("")
    setMasterDomainResults([])

    try {
      const response = await fetch('/api/domains/master-domain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          masterDomain: trimmedMasterDomain,
          domainNames: successfulAddedDomainNames
        })
      })

      const data = await response.json()

      if (response.ok) {
        // Close the modal
        setShowAddDomainModal(false)
        
        // Refresh domains so the table immediately reflects the new redirect
        await fetchDomains()
        
        // Show success message
        setDnsError(`✓ Master domain redirect configured for ${successfulAddedDomainNames.length} domain(s)`)
        setTimeout(() => setDnsError(""), 5000)
        
        // Reset modal state
        setDomainList("")
        setAddedDomains([])
        setAddDomainError("")
        setCurrentlyAdding("")
        setMasterDomain("")
        setMasterDomainResults([])
        setMasterDomainError("")
      } else {
        setMasterDomainError(data.message || data.error || "Failed to configure master domain redirects")
      }
    } catch (error) {
      console.error("Error configuring master domain:", error)
      setMasterDomainError("Failed to configure master domain redirects")
    } finally {
      setConfiguringMasterDomain(false)
    }
  }

  const closeAddDomainModal = () => {
    const hasSuccessfulDomains = successfulAddedDomainNames.length > 0
    const hasMasterDomain = masterDomain.trim().length > 0

    if (hasSuccessfulDomains && !hasMasterDomain && !skipRedirectConfirmed) {
      const confirmSkip = window.confirm(
        "Are you sure you'd like to proceed without setting up the redirect domain?"
      )
      if (!confirmSkip) {
        return
      }
      setSkipRedirectConfirmed(true)
    }

    setShowAddDomainModal(false)
    setDomainList("")
    setAddedDomains([])
    setAddDomainError("")
    setCurrentlyAdding("")
    setMasterDomain("")
    setMasterDomainResults([])
    setMasterDomainError("")
    setConfiguringMasterDomain(false)
  }

  const handleDeleteDomains = async () => {
    if (selectedDomainsToDelete.size === 0) {
      return
    }

    setDeletingDomains(true)

    try {
      const response = await fetch('/api/domains/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          domainNames: Array.from(selectedDomainsToDelete)
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Close modal and refresh domains list
        setShowDeleteDomainModal(false)
        setSelectedDomainsToDelete(new Set())
        await fetchDomains()
        
        // Show success message
        setDnsError(`✓ Successfully deleted ${data.deleted} domain(s)`)
        setTimeout(() => setDnsError(""), 5000)
      } else {
        setDnsError(data.message || data.error || "Failed to delete domains")
        setTimeout(() => setDnsError(""), 5000)
      }
    } catch (error) {
      console.error("Error deleting domains:", error)
      setDnsError("Failed to delete domains")
      setTimeout(() => setDnsError(""), 5000)
    } finally {
      setDeletingDomains(false)
    }
  }

  const exportNameserversCsv = async () => {
    if (domains.length === 0) {
      return
    }

    setExportingCsv(true)
    
    try {
      // Generate CSV content from database nameservers
      const csvRows = []
      
      // Header row
      csvRows.push('Domain,Nameserver 1,Nameserver 2')
      
      // Data rows - use nameservers from database
      domains.forEach(domain => {
        const nameservers = domain.nameservers || []
        
        // Get first 2 nameservers
        const ns1 = Array.isArray(nameservers) && nameservers[0] ? nameservers[0] : ''
        const ns2 = Array.isArray(nameservers) && nameservers[1] ? nameservers[1] : ''
        
        csvRows.push(`${domain.domain_name},${ns1},${ns2}`)
      })
      
      // Create CSV string
      const csvContent = csvRows.join('\n')
      
      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      
      link.setAttribute('href', url)
      link.setAttribute('download', `nameservers-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
    } catch (error) {
      console.error("Error exporting CSV:", error)
      setDnsError("Failed to export CSV")
    } finally {
      setExportingCsv(false)
    }
  }

  const handleOpenBilling = async () => {
    setOpeningBilling(true)
    try {
      const response = await fetch("/api/create-portal-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/domains`,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        window.location.href = data.url
      } else {
        console.error("Failed to open billing portal:", data.error)
        setOpeningBilling(false)
      }
    } catch (error) {
      console.error("Error opening portal:", error)
      setOpeningBilling(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
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

        {/* Content */}
        {subscriptions.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <svg 
                  className="mx-auto h-12 w-12 text-gray-400 mb-4" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" 
                  />
                </svg>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">No Active Servers</h2>
                <p className="text-gray-600 mb-6">
                  You need an active server subscription to manage domains.
                </p>
                <Button 
                  onClick={() => router.push("/checkout")}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Get Started
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                {/* Server Selection */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {subscriptions.length === 1 ? "Server:" : "Server:"}
                  </span>
                  {subscriptions.length === 1 ? (
                    <span className="text-sm font-medium text-gray-900">
                      {subscriptions[0].serverName || `Server ${subscriptions[0].id.slice(0, 8)}`}
                    </span>
                  ) : (
                    <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                      <SelectTrigger className="h-8 w-[180px] text-sm">
                        <SelectValue placeholder="Select server" />
                      </SelectTrigger>
                      <SelectContent>
                        {subscriptions.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.serverName || `Server ${sub.id.slice(0, 8)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Edit Domains
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setShowAddDomainModal(true)}>
                        Add domains
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowDeleteDomainModal(true)}>
                        Delete domains
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    onClick={checkNameserverStatus}
                    disabled={checkingDns || domains.length === 0}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {checkingDns ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                        Checking...
                      </>
                    ) : (
                      'Check Nameserver Status'
                    )}
                  </Button>
                  <Button
                    onClick={exportNameserversCsv}
                    disabled={exportingCsv || checkingDns || domains.length === 0}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {exportingCsv ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                        Exporting...
                      </>
                    ) : (
                      'Export Nameservers'
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* DNS Error Alert */}
              {dnsError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">{dnsError}</p>
                </div>
              )}
              
              {/* Domain Table */}
              {selectedServerId && (
                <div className="border rounded-lg">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left" style={{ width: '30%' }}>Domain</TableHead>
                        <TableHead className="text-center" style={{ width: '11%' }}>MX</TableHead>
                        <TableHead className="text-center" style={{ width: '11%' }}>SPF</TableHead>
                        <TableHead className="text-center" style={{ width: '11%' }}>DMARC</TableHead>
                        <TableHead className="text-center" style={{ width: '11%' }}>DKIM</TableHead>
                        <TableHead className="text-center" style={{ width: '11%' }}>Domain redirect</TableHead>
                        <TableHead className="text-center" style={{ width: '15%' }}>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingDomains ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                              <p className="text-gray-600">Loading domains from server...</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : domainsError ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <svg className="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <div>
                                <p className="text-red-600 font-medium">Error loading domains</p>
                                <p className="text-gray-600 text-sm mt-1">{domainsError}</p>
                              </div>
                              <Button 
                                onClick={fetchDomains}
                                variant="outline"
                                size="sm"
                                className="mt-2"
                              >
                                Try Again
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : domains.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                              </svg>
                              <div>
                                <p className="text-gray-900 font-medium">No domains found</p>
                                <p className="text-gray-600 text-sm mt-1">This server doesn't have any domains configured yet</p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        domains.map((domain, index) => {
                          const dnsData = dnsRecords[domain.domain_name]
                          const isExpanded = expandedDomain === domain.domain_name
                          return (
                            <>
                              <TableRow 
                                key={index}
                                onClick={() => setExpandedDomain(isExpanded ? null : domain.domain_name)}
                                className="cursor-pointer hover:bg-gray-50"
                              >
                                <TableCell className="text-left font-medium">
                                  <div className="flex items-center gap-2">
                                    <svg 
                                      className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                      fill="none" 
                                      viewBox="0 0 24 24" 
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    {domain.domain_name}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  {checkingDomainIds.has(domain.id!) ? (
                                    <div className="flex justify-center">
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                    </div>
                                  ) : domain.mxRecord || dnsData?.mx ? (
                                    <span className="text-green-600">✓</span>
                                  ) : dnsRecords[domain.domain_name] ? (
                                    <span className="text-red-600">✗</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {checkingDomainIds.has(domain.id!) ? (
                                    <div className="flex justify-center">
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                    </div>
                                  ) : domain.spfRecord || dnsData?.spf ? (
                                    <span className="text-green-600">✓</span>
                                  ) : dnsRecords[domain.domain_name] ? (
                                    <span className="text-red-600">✗</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {checkingDomainIds.has(domain.id!) ? (
                                    <div className="flex justify-center">
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                    </div>
                                  ) : domain.dmarcRecord || dnsData?.dmarc ? (
                                    <span className="text-green-600">✓</span>
                                  ) : dnsRecords[domain.domain_name] ? (
                                    <span className="text-red-600">✗</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {checkingDomainIds.has(domain.id!) ? (
                                    <div className="flex justify-center">
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                    </div>
                                  ) : domain.dkimRecord || dnsData?.dkim ? (
                                    <span className="text-green-600">✓</span>
                                  ) : dnsRecords[domain.domain_name] ? (
                                    <span className="text-red-600">✗</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {checkingDomainIds.has(domain.id!) ? (
                                    <div className="flex justify-center">
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                    </div>
                                  ) : domain.redirectConfigured ? (
                                    <span className="text-green-600">✓</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {domain.dnsConfigured && domain.cloudflareStatus === 'active' ? (
                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                      Active
                                    </span>
                                  ) : domain.cloudflareStatus === 'inactive' ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 cursor-help">
                                            Inactive
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="max-w-xs">Please give your new nameserver record 1-2 hours to populate, and try again.</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 cursor-help">
                                            Pending
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="max-w-xs">Please click on check nameservers to begin DNS adjustments</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </TableCell>
                              </TableRow>
                              {isExpanded && (
                                <TableRow key={`${index}-expanded`}>
                                  <TableCell colSpan={6} className="bg-gray-50">
                                    <div className="py-3 px-4 pl-10 space-y-4">
                                      {/* Nameservers */}
                                      {domain.nameservers && Array.isArray(domain.nameservers) && domain.nameservers.length > 0 && (
                                        <div>
                                          <p className="text-sm font-semibold text-gray-700 mb-2">Nameservers:</p>
                                          <div className="space-y-1">
                                            {domain.nameservers.map((ns: string, idx: number) => (
                                              <div key={idx} className="text-sm text-gray-600 font-mono">
                                                {ns}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Domain Redirect */}
                                      {domain.masterDomain && (
                                        <div>
                                          <p className="text-sm font-semibold text-gray-700 mb-2">Domain Redirect:</p>
                                          <div className="space-y-2">
                                            <div>
                                              <span className="text-xs font-medium text-gray-500">Redirects to:</span>
                                              <div className="text-sm text-gray-600 font-mono">{domain.masterDomain}</div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* DNS Records */}
                                      {domain.dnsConfigured && (
                                        <div>
                                          <p className="text-sm font-semibold text-gray-700 mb-2">DNS Records:</p>
                                          <div className="space-y-2">
                                            {domain.mxRecord && (
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">MX:</span>
                                                <div className="text-sm text-gray-600 font-mono">{domain.mxRecord}</div>
                                              </div>
                                            )}
                                            {domain.spfRecord && (
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">SPF:</span>
                                                <div className="text-sm text-gray-600 font-mono break-all">{domain.spfRecord}</div>
                                              </div>
                                            )}
                                            {domain.dmarcRecord && (
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">DMARC:</span>
                                                <div className="text-sm text-gray-600 font-mono break-all">{domain.dmarcRecord}</div>
                                              </div>
                                            )}
                                            {domain.dkimRecord && (
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">DKIM:</span>
                                                <div className="text-sm text-gray-600 font-mono break-all">{domain.dkimRecord}</div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end px-4 py-2 border-t">
                    <span
                      className={
                        domains.length >= MAX_DOMAINS_PER_SERVER
                          ? "text-sm text-red-600 font-semibold"
                          : "text-sm text-gray-900 font-semibold"
                      }
                    >
                      {domains.length} / {MAX_DOMAINS_PER_SERVER}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
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
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
          disabled
        >
          Domains
        </Button>
        <Button
          onClick={() => router.push("/inboxes")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
        >
          Inboxes
        </Button>
      </div>

      {/* Bottom Left Buttons */}
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

      {/* Add Domain Modal */}
      <Dialog
        open={showAddDomainModal}
        onOpenChange={(open) => {
          if (!open) {
            closeAddDomainModal()
          } else {
            setShowAddDomainModal(true)
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add Domains</DialogTitle>
            <DialogDescription>
              Enter domain names (one per line) and click "Add Domains". The nameservers will show for a brief period of time initially, and can be exported in bulk by clicking the "export" button.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Textarea for multiple domains */}
            <div>
              <Textarea
                placeholder="Enter domain names (one per line)&#10;example.com&#10;test.com&#10;another-domain.com"
                value={domainList}
                onChange={(e) => setDomainList(e.target.value)}
                disabled={addingDomains}
                className="w-full min-h-[120px] font-mono text-sm"
                autoFocus
              />
              {addingDomains && currentlyAdding && (
                <p className="text-sm text-gray-500 mt-2">
                  Adding: <span className="font-medium">{currentlyAdding}</span>
                </p>
              )}
            </div>

            {/* Add Domains Button */}
            {!addingDomains && domainList.trim() && (
              <Button
                onClick={handleAddDomains}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Add Domains
              </Button>
            )}

            {/* Error Message */}
            {addDomainError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{addDomainError}</p>
              </div>
            )}

            {/* Added Domains List */}
            {addedDomains.length > 0 && (
              <div className="border rounded-md">
                <div className="max-h-[300px] overflow-y-auto">
                  {addedDomains.map((item, index) => (
                    <div 
                      key={index} 
                      className={`p-4 border-b last:border-b-0 ${
                        item.status === 'success' ? 'bg-green-50' : 'bg-red-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.domain}</p>
                          {item.status === 'success' && item.nameservers.length > 0 && (
                            <div className="mt-2 space-y-2">
                              <div className="text-sm text-gray-600">
                                <p className="font-medium mb-1">Nameservers:</p>
                                {item.nameservers.map((ns, idx) => (
                                  <p key={idx} className="text-xs">{ns}</p>
                                ))}
                              </div>
                              {item.cloudflareStatus && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-600">Status:</span>
                                  <Badge 
                                    variant={
                                      item.cloudflareStatus === 'active' ? 'default' : 
                                      item.cloudflareStatus === 'pending' ? 'secondary' : 
                                      'destructive'
                                    }
                                    className={
                                      item.cloudflareStatus === 'active' ? 'bg-green-500' : 
                                      item.cloudflareStatus === 'pending' ? 'bg-yellow-500' : 
                                      ''
                                    }
                                  >
                                    {item.cloudflareStatus}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          )}
                          {item.status === 'error' && item.message && (
                            <p className="mt-1 text-xs text-red-600">{item.message}</p>
                          )}
                        </div>
                        <span className={`text-sm font-semibold ${
                          item.status === 'success' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {item.status === 'success' ? '✓ Added' : '✗ Failed'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Master Domain Redirect */}
            {addedDomains.length > 0 && (
              <div className="space-y-3 rounded-md border border-blue-100 bg-blue-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Master domain redirect</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Redirect new domains to your brands main domain.
                  </p>
                  <p className="text-xs text-gray-600">
                    Domains ready: {successfulAddedDomainNames.length}
                  </p>
                </div>
                <Input
                  placeholder="master-domain.com"
                  value={masterDomain}
                  onChange={(e) => setMasterDomain(e.target.value)}
                  disabled={configuringMasterDomain}
                  className="text-sm"
                />
                {masterDomainError && (
                  <p className="text-xs text-red-600">{masterDomainError}</p>
                )}
                <Button
                  onClick={handleConfigureMasterDomain}
                  disabled={configuringMasterDomain || successfulAddedDomainNames.length === 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {configuringMasterDomain ? "Configuring redirects..." : "Apply master domain redirect"}
                </Button>
                {masterDomainResults.length > 0 && (
                  <div className="rounded-md border border-white bg-white">
                    {masterDomainResults.map((result, idx) => (
                      <div key={`${result.domain}-${idx}`} className="p-3 border-b last:border-b-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">{result.domain}</span>
                          <span
                            className={`text-xs font-semibold ${
                              result.status === 'configured'
                                ? 'text-green-600'
                                : result.status === 'skipped'
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}
                          >
                            {result.status === 'configured'
                              ? 'Configured'
                              : result.status === 'skipped'
                              ? 'Skipped'
                              : 'Failed'}
                          </span>
                        </div>
                        {result.message && (
                          <p className="mt-1 text-xs text-gray-600">{result.message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={closeAddDomainModal}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Domain Modal */}
      <Dialog open={showDeleteDomainModal} onOpenChange={setShowDeleteDomainModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Delete Domains</DialogTitle>
            <DialogDescription>
              Select the domains you want to delete from this server. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {domains.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No domains available</p>
            ) : (
              <>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedDomainsToDelete.size === domains.length) {
                        // Deselect all
                        setSelectedDomainsToDelete(new Set())
                      } else {
                        // Select all
                        setSelectedDomainsToDelete(new Set(domains.map(d => d.domain_name)))
                      }
                    }}
                  >
                    {selectedDomainsToDelete.size === domains.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {domains.map((domain) => {
                    const inboxCount = domain.inboxCount ?? 0
                    return (
                    <div
                      key={domain.id}
                      className="flex items-center space-x-3 p-3 rounded-md border hover:bg-gray-50"
                    >
                      <Checkbox
                        id={`delete-${domain.id}`}
                        checked={selectedDomainsToDelete.has(domain.domain_name)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedDomainsToDelete)
                          if (checked) {
                            newSet.add(domain.domain_name)
                          } else {
                            newSet.delete(domain.domain_name)
                          }
                          setSelectedDomainsToDelete(newSet)
                        }}
                      />
                      <label
                        htmlFor={`delete-${domain.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <p className="text-sm font-medium text-gray-900">{domain.domain_name}</p>
                        <p
                          className={`text-xs ${
                            inboxCount > 0 ? "text-red-600 font-medium" : "text-gray-500"
                          }`}
                        >
                          {inboxCount} active inbox{inboxCount === 1 ? "" : "es"}
                        </p>
                      </label>
                    </div>
                  )})}
                </div>
              </>
            )}

            {selectedDomainsToDelete.size > 0 && (
              <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="font-medium">⚠️ You are about to delete {selectedDomainsToDelete.size} domain(s)</p>
                <p className="text-xs mt-1">This will remove the domain from your email server immediately. All inboxes attached to this domain will be impacted.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDomainModal(false)
                setSelectedDomainsToDelete(new Set())
              }}
              disabled={deletingDomains}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDomains}
              disabled={selectedDomainsToDelete.size === 0 || deletingDomains}
            >
              {deletingDomains ? 'Deleting...' : `Delete ${selectedDomainsToDelete.size} domain(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

