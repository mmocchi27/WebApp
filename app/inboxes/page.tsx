'use client'
 
import { useUser, useOrganization, OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface Subscription {
  id: string
  status: string
  serverName?: string | null
  ipAddress?: string | null
  domainLimit?: number
  inboxLimit?: number
}

const MAX_INBOXES_PER_DOMAIN = 5 // Business rule: fixed limit per domain

interface Domain {
  id: string
  domain_name: string
  cloudflareStatus?: string
  dnsConfigured?: boolean
  inboxCount?: number
}

interface InboxEntry {
  username: string
  firstName: string
  lastName: string
}

interface StoredInbox {
  id: string
  email: string
  domainName: string
  firstName: string
  lastName: string
  status: string
  createdAt: string
}

export default function InboxesPage() {
  const router = useRouter()
  const { user } = useUser()
  const { organization } = useOrganization()

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [selectedServerId, setSelectedServerId] = useState("")
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true)
  const [subscriptionError, setSubscriptionError] = useState("")
  const [showAddInboxModal, setShowAddInboxModal] = useState(false)
  const [availableDomains, setAvailableDomains] = useState<Domain[]>([])
  const [loadingDomains, setLoadingDomains] = useState(false)
  const [domainFetchError, setDomainFetchError] = useState("")
  const [domainSelectionError, setDomainSelectionError] = useState("")
  const [exportingCsv, setExportingCsv] = useState(false)
  const [selectedDomainNames, setSelectedDomainNames] = useState<Set<string>>(new Set())
  const [domainInboxCounts, setDomainInboxCounts] = useState<Record<string, number>>({})
  const [globalInboxCount, setGlobalInboxCount] = useState(1)
  const globalInboxCountRef = useRef(globalInboxCount)
  const [showCreateInboxReview, setShowCreateInboxReview] = useState(false)
  const [inboxFormData, setInboxFormData] = useState<Record<string, InboxEntry[]>>({})
  const [bulkInboxTemplates, setBulkInboxTemplates] = useState<InboxEntry[]>([
    { username: "", firstName: "", lastName: "" },
  ])
  const [creatingInboxes, setCreatingInboxes] = useState(false)
  const [creationResults, setCreationResults] = useState<
    { domain: string; email: string; status: "success" | "error"; message?: string; password?: string }[]
  >([])
  const [creationError, setCreationError] = useState("")
  const [inboxesData, setInboxesData] = useState<StoredInbox[]>([])
  const [loadingInboxes, setLoadingInboxes] = useState(false)
  const [inboxesError, setInboxesError] = useState("")
  const [showDeleteInboxModal, setShowDeleteInboxModal] = useState(false)
  const [selectedInboxIds, setSelectedInboxIds] = useState<Set<string>>(new Set())
  const [deletingInboxes, setDeletingInboxes] = useState(false)
  const [deleteInboxesError, setDeleteInboxesError] = useState("")
  const [deleteResults, setDeleteResults] = useState<
    { email: string; status: "success" | "error"; message?: string }[]
  >([])
  const [pageNotice, setPageNotice] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const serverInboxCount = inboxesData.length
  const selectedServer = subscriptions.find(sub => sub.id === selectedServerId)
  const serverInboxLimit = selectedServer?.inboxLimit ?? 102
  const serverRemainingInboxSlots = Math.max(0, serverInboxLimit - serverInboxCount)
  const serverAtCapacity = serverRemainingInboxSlots === 0
  const handleExportOption = async (destination: "Instantly" | "Smartlead") => {
    if (!selectedServerId) {
      setPageNotice({
        type: "error",
        text: "Select a server before exporting inboxes.",
      })
      return
    }

    if (inboxesData.length === 0) {
      setPageNotice({
        type: "error",
        text: "This server does not have any active inboxes to export.",
      })
      return
    }

    if (exportingCsv) {
      return
    }

    setExportingCsv(true)
    try {
      const response = await fetch("/api/inboxes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: selectedServerId,
          destination,
        }),
      })

      if (!response.ok) {
        let errorMessage = "Failed to export inboxes"
        try {
          const data = await response.json()
          errorMessage = data.message || data.error || errorMessage
        } catch {
          // ignore JSON parse errors
        }
        setPageNotice({
          type: "error",
          text: errorMessage,
        })
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
      setTimeout(() => window.URL.revokeObjectURL(url), 500)

      setPageNotice({
        type: "success",
        text: `Export generated for ${destination}.`,
      })
    } catch (error: any) {
      setPageNotice({
        type: "error",
        text: error.message || "Failed to export inboxes",
      })
    } finally {
      setExportingCsv(false)
    }
  }
  const flattenedInboxRows = useMemo(() => {
    const rows: { domain: string; index: number; entry: InboxEntry }[] = []
    Object.entries(inboxFormData).forEach(([domain, entries]) => {
      entries.forEach((entry, index) => {
        rows.push({ domain, index, entry })
      })
    })
    return rows
  }, [inboxFormData])

  const incompleteAdminFields = bulkInboxTemplates.map((template) => ({
    username: template.username.trim().length === 0,
    firstName: template.firstName.trim().length === 0,
    lastName: template.lastName.trim().length === 0,
  }))

  const isAdminTemplateComplete = incompleteAdminFields.every(
    (fields) => !fields.username && !fields.firstName && !fields.lastName
  )

  const isAdminTemplateEmpty = bulkInboxTemplates.every(
    (template) =>
      template.username.trim().length === 0 &&
      template.firstName.trim().length === 0 &&
      template.lastName.trim().length === 0
  )

  const isAllInboxesComplete = flattenedInboxRows.every(
    ({ entry }) =>
      entry.username.trim().length > 0 &&
      entry.firstName.trim().length > 0 &&
      entry.lastName.trim().length > 0
  )

  const canSubmit =
    isAllInboxesComplete && (isAdminTemplateEmpty || isAdminTemplateComplete)

  const fetchInboxes = useCallback(async () => {
    if (!selectedServerId) return
    setLoadingInboxes(true)
    setInboxesError("")
    try {
      const response = await fetch(`/api/inboxes?serverId=${selectedServerId}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to load inboxes")
      }
      setInboxesData(data.inboxes || [])
    } catch (error: any) {
      setInboxesError(error.message || "Failed to load inboxes")
      setInboxesData([])
    } finally {
      setLoadingInboxes(false)
    }
  }, [selectedServerId])

  const toggleInboxSelection = (inboxId: string, checked: boolean) => {
    setSelectedInboxIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(inboxId)
      } else {
        next.delete(inboxId)
      }
      return next
    })
  }

  const handleSelectAllInboxes = () => {
    setSelectedInboxIds((prev) => {
      if (prev.size === inboxesData.length) {
        return new Set()
      }
      return new Set(inboxesData.map((inbox) => inbox.id))
    })
  }

  const handleDeleteInboxes = async () => {
    if (!selectedServerId || selectedInboxIds.size === 0) return

    setDeletingInboxes(true)
    setDeleteInboxesError("")
    setDeleteResults([])

    try {
      const response = await fetch("/api/inboxes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: selectedServerId,
          inboxIds: Array.from(selectedInboxIds),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete inboxes")
      }

      const results = data.results || []
      const allSuccess = results.length === 0 || results.every((result: { status: string }) => result.status === "success")
      setDeleteResults(results)
      await fetchInboxes()
      setSelectedInboxIds(new Set())
      if (allSuccess) {
        handleCloseDeleteModal()
        setPageNotice({ type: "success", text: "Inboxes successfully deleted" })
      }
    } catch (error: any) {
      setDeleteInboxesError(error.message || "Failed to delete inboxes")
    } finally {
      setDeletingInboxes(false)
    }
  }

  const handleCloseDeleteModal = () => {
    setShowDeleteInboxModal(false)
    setSelectedInboxIds(new Set())
    setDeleteResults([])
    setDeleteInboxesError("")
  }

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
    let isMounted = true
    const loadSubscriptions = async () => {
      setLoadingSubscriptions(true)
      setSubscriptionError("")
      try {
        const response = await fetch("/api/subscriptions")
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || "Failed to load servers")
        }

        if (!isMounted) return

        const subs: Subscription[] = data.subscriptions || []
        const activeSubs = subs.filter(
          (sub) => sub.status?.toLowerCase() === "active"
        )
        setSubscriptions(activeSubs)
        setSelectedServerId(prev => {
          if (prev && activeSubs.some(sub => sub.id === prev)) {
            return prev
          }
          if (storageKey && typeof window !== "undefined") {
            const storedId = localStorage.getItem(storageKey)
            if (storedId && activeSubs.some(sub => sub.id === storedId)) {
              return storedId
            }
          }
          return activeSubs.length > 0 ? activeSubs[0].id : ""
        })
      } catch (error: any) {
        if (!isMounted) return
        console.error("Error fetching subscriptions:", error)
        setSubscriptionError(error.message || "Failed to load servers")
        setSubscriptions([])
        setSelectedServerId("")
      } finally {
        if (isMounted) {
          setLoadingSubscriptions(false)
        }
      }
    }

    loadSubscriptions()
    return () => {
      isMounted = false
    }
  }, [organization?.id, storageKey])

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

  const fetchActiveDomains = useCallback(async () => {
    if (!selectedServerId) {
      setAvailableDomains([])
      setSelectedDomainNames(new Set())
      return
    }

    setLoadingDomains(true)
    setDomainFetchError("")

    try {
      const response = await fetch(`/api/domains?serverId=${selectedServerId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to load domains")
      }

      const activeDomains = (data.domains || [])
        .filter((domain: Domain) => domain.dnsConfigured && domain.cloudflareStatus === "active")
        .map((domain: Domain) => ({
          ...domain,
          inboxCount: domain.inboxCount ?? (domain.inboxes?.length || 0),
        }))

      setAvailableDomains(activeDomains)
      setSelectedDomainNames((prev) => {
        const next = new Set<string>()
        activeDomains.forEach((domain) => {
          if (prev.has(domain.domain_name)) {
            next.add(domain.domain_name)
          }
        })
        return next
      })
    } catch (error: any) {
      console.error("Error fetching domains for inboxes:", error)
      setDomainFetchError(error.message || "Failed to load domains")
      setAvailableDomains([])
      setSelectedDomainNames(new Set())
    } finally {
      setLoadingDomains(false)
    }
  }, [selectedServerId])
  useEffect(() => {
    globalInboxCountRef.current = globalInboxCount
  }, [globalInboxCount])

  useEffect(() => {
    if (showAddInboxModal) {
      fetchActiveDomains()
      setDomainSelectionError("")
    } else {
      setAvailableDomains([])
      setDomainFetchError("")
      setDomainSelectionError("")
      setSelectedDomainNames(new Set())
      setDomainInboxCounts({})
      setGlobalInboxCount(1)
    }
  }, [showAddInboxModal, fetchActiveDomains])

useEffect(() => {
  if (!showCreateInboxReview) {
    setCreatingInboxes(false)
    setCreationError("")
    setCreationResults([])
  }
}, [showCreateInboxReview])

  useEffect(() => {
    if (!showDeleteInboxModal) return
    setSelectedInboxIds(new Set())
    setDeleteResults([])
    setDeleteInboxesError("")
  }, [showDeleteInboxModal, inboxesData])

useEffect(() => {
  if (selectedServerId) {
    fetchInboxes()
  } else {
    setInboxesData([])
  }
}, [selectedServerId, fetchInboxes])

  const toggleDomainSelection = (domainName: string, checked: boolean) => {
    setDomainSelectionError("")
    setSelectedDomainNames((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(domainName)
      } else {
        next.delete(domainName)
      }
      return next
    })

    setDomainInboxCounts((prev) => {
      if (checked) {
        return { ...prev, [domainName]: globalInboxCount }
      }
      const { [domainName]: _, ...rest } = prev
      return rest
    })
  }

  const handleToggleSelectAllDomains = () => {
    setDomainSelectionError("")
    const selectableDomains = availableDomains.filter(
      (domain) => (domain.inboxCount ?? 0) < MAX_INBOXES_PER_DOMAIN
    )

    if (selectableDomains.length === 0) {
      return
    }

    const currentlySelectedEligible = selectableDomains.every((domain) =>
      selectedDomainNames.has(domain.domain_name)
    )

    if (currentlySelectedEligible) {
      setSelectedDomainNames((prev) => {
        const next = new Set(prev)
        selectableDomains.forEach((domain) => next.delete(domain.domain_name))
        return next
      })
      setDomainInboxCounts((prev) => {
        const next = { ...prev }
        selectableDomains.forEach((domain) => {
          delete next[domain.domain_name]
        })
        return next
      })
    } else {
      setSelectedDomainNames((prev) => {
        const next = new Set(prev)
        selectableDomains.forEach((domain) => next.add(domain.domain_name))
        return next
      })
      setDomainInboxCounts((prev) => {
        const next = { ...prev }
        selectableDomains.forEach((domain) => {
          next[domain.domain_name] = globalInboxCount
        })
        return next
      })
    }
  }

  const handleGlobalInboxCountChange = (value: string) => {
    const numericValue = Number(value)
    setDomainSelectionError("")
    setGlobalInboxCount(numericValue)
    setDomainInboxCounts((prev) => {
      const next = { ...prev }
      selectedDomainNames.forEach((domain) => {
        next[domain] = numericValue
      })
      return next
    })
  }

  const createBlankTemplates = useCallback(
    (count: number) =>
      Array.from({ length: count }, () => ({
        username: "",
        firstName: "",
        lastName: "",
      })),
    []
  )

const handleOpenCreateInboxes = () => {
    if (selectedDomainNames.size === 0) {
      return
    }

    setDomainSelectionError("")

    if (serverAtCapacity) {
      setDomainSelectionError(
        "Server inbox limit reached. Purchase another server to add more inboxes."
      )
      return
    }

    const fallback = globalInboxCount || 1
    const counts: Record<string, number> = {}
    selectedDomainNames.forEach((domain) => {
      counts[domain] = domainInboxCounts[domain] || fallback
    })

    const requestedTotal = Object.values(counts).reduce(
      (sum, count) => sum + (count || 0),
      0
    )

    if (requestedTotal === 0) {
      setDomainSelectionError("Select at least one domain to create inboxes.")
      return
    }

    if (requestedTotal > serverRemainingInboxSlots) {
      setDomainSelectionError(
        serverRemainingInboxSlots === 0
          ? "Server inbox limit reached. Purchase another server to add more inboxes."
          : `You can create ${serverRemainingInboxSlots} more inbox${
              serverRemainingInboxSlots === 1 ? "" : "es"
            } on this server. Reduce the number of inboxes before proceeding.`
      )
      return
    }

    setDomainInboxCounts(counts)
    setInboxFormData((prev) => {
      const next: Record<string, InboxEntry[]> = {}
      selectedDomainNames.forEach((domain) => {
        const count = counts[domain] || fallback
        const prevEntries = prev[domain] || []
        next[domain] = Array.from({ length: count }, (_, idx) => ({
          username: prevEntries[idx]?.username || "",
          firstName: prevEntries[idx]?.firstName || "",
          lastName: prevEntries[idx]?.lastName || "",
        }))
      })
      return next
    })

    const templateLength =
      Math.max(fallback, ...Object.values(counts).filter(Boolean)) || fallback
    setBulkInboxTemplates(createBlankTemplates(templateLength))
    setShowCreateInboxReview(true)
  }

  const handleInboxFieldChange = (
    domain: string,
    index: number,
    field: keyof InboxEntry,
    value: string
  ) => {
    setInboxFormData((prev) => {
      const domainEntries = prev[domain] ? [...prev[domain]] : []
      if (!domainEntries[index]) {
        domainEntries[index] = { username: "", firstName: "", lastName: "" }
      }
      domainEntries[index] = {
        ...domainEntries[index],
        [field]: value,
      }
      return {
        ...prev,
        [domain]: domainEntries,
      }
    })
  }

  const handleBulkTemplateChange = (index: number, field: keyof InboxEntry, value: string) => {
    setBulkInboxTemplates((prev) => {
      const next = [...prev]
      if (!next[index]) {
        next[index] = { username: "", firstName: "", lastName: "" }
      }
      next[index] = {
        ...next[index],
        [field]: value,
      }
      return next
    })
    setInboxFormData((prev) => {
      const next: Record<string, InboxEntry[]> = {}
      Object.entries(prev).forEach(([domain, entries]) => {
        next[domain] = entries.map((entry, idx) => {
          if (idx !== index) {
            return entry
          }
          return {
            ...entry,
            [field]: value,
          }
        })
      })
      return next
    })
  }

  const handleConfirmCreateInboxes = async () => {
    if (!selectedServerId || !canSubmit || creatingInboxes) return

    const totalRequested = flattenedInboxRows.length
    const selectedServer = subscriptions.find(sub => sub.id === selectedServerId)
    const serverInboxLimit = selectedServer?.inboxLimit ?? 102
    if (serverInboxCount + totalRequested > serverInboxLimit) {
      setCreationError(
        serverRemainingInboxSlots === 0
          ? "Server inbox limit reached. Purchase another server to add more inboxes."
          : `You can create ${serverRemainingInboxSlots} more inbox${
              serverRemainingInboxSlots === 1 ? "" : "es"
            } on this server. Reduce the number of inboxes before proceeding.`
      )
      return
    }

    // Close both modals immediately
    setShowCreateInboxReview(false)
    setShowAddInboxModal(false)
    
    setCreatingInboxes(true)
    setCreationError("")
    setCreationResults([])
    
    // Show creating notice
    setPageNotice({ type: "success", text: `Creating ${totalRequested} inbox${totalRequested === 1 ? '' : 'es'}...` })

    try {
      const response = await fetch("/api/inboxes/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: selectedServerId,
          inboxes: flattenedInboxRows.map(({ domain, entry }) => ({
            domainName: domain,
            username: entry.username.trim(),
            firstName: entry.firstName.trim(),
            lastName: entry.lastName.trim(),
          })),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to create inboxes")
      }

      const results = data.results || []
      const successCount = results.filter((r: any) => r.status === "success").length
      const errorCount = results.filter((r: any) => r.status === "error").length
      const failedInboxes = results.filter((r: any) => r.status === "error")
      
      setCreationResults(results)
      await fetchInboxes()
      
      // Show success/error notice with failed inbox details
      if (errorCount === 0) {
        setPageNotice({ type: "success", text: `Successfully created ${successCount} inbox${successCount === 1 ? '' : 'es'}!` })
      } else if (successCount === 0) {
        const failedList = failedInboxes.map((r: any) => r.email).join(", ")
        setPageNotice({ 
          type: "error", 
          text: `Failed to create ${errorCount} inbox${errorCount === 1 ? '' : 'es'}: ${failedList}. Please attempt to recreate ${errorCount === 1 ? 'this inbox' : 'these inboxes'}.` 
        })
      } else {
        const failedList = failedInboxes.map((r: any) => r.email).join(", ")
        setPageNotice({ 
          type: "success", 
          text: `Created ${successCount} inbox${successCount === 1 ? '' : 'es'}. Failed to create ${errorCount}: ${failedList}. Please attempt to recreate the failed inbox${errorCount === 1 ? '' : 'es'}.` 
        })
      }
    } catch (error: any) {
      const errorMessage = error.message || "Failed to create inboxes"
      setCreationError(errorMessage)
      setPageNotice({ type: "error", text: errorMessage })
    } finally {
      setCreatingInboxes(false)
    }
  }

  const applyBulkTemplate = () => {
    setInboxFormData((prev) => {
      const next: Record<string, InboxEntry[]> = {}
      Object.entries(prev).forEach(([domain, entries]) => {
        next[domain] = entries.map((entry, idx) => {
          const template = bulkInboxTemplates[idx]
          if (!template) {
            return entry
          }
          return {
            username: template.username,
            firstName: template.firstName,
            lastName: template.lastName,
          }
        })
      })
      return next
    })
  }

  useEffect(() => {
    if (!showCreateInboxReview) {
      setBulkInboxTemplates(createBlankTemplates(1))
    }
  }, [showCreateInboxReview, createBlankTemplates])

  // Removed auto-dismiss - users must manually close notices to have time to note failed inboxes

  if (loadingSubscriptions) {
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
              <OrganizationSwitcher
                hidePersonal={true}
                afterSelectOrganizationUrl="/inboxes"
                afterCreateOrganizationUrl="/inboxes"
              />
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>

          <div className="flex flex-col items-center text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Inboxes</h1>
            <p className="text-gray-600 mt-2">Select a server to manage its inboxes.</p>
          </div>

        {pageNotice && (
          <div
            className={`mb-6 rounded-md border p-4 ${
              pageNotice.type === "success"
                ? "border-green-200 bg-green-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <svg 
                  className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                    pageNotice.type === "success" ? "text-green-600" : "text-red-600"
                  }`}
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  {pageNotice.type === "success" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  )}
                </svg>
                <p className={`text-sm ${
                  pageNotice.type === "success" ? "text-green-800" : "text-red-800"
                }`}>
                  {pageNotice.text}
                </p>
              </div>
              <button
                onClick={() => setPageNotice(null)}
                className={`ml-4 flex-shrink-0 ${
                  pageNotice.type === "success" 
                    ? "text-green-600 hover:text-green-800" 
                    : "text-red-600 hover:text-red-800"
                }`}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

          {subscriptionError && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {subscriptionError}
            </div>
          )}

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
                    You need an active server subscription to manage inboxes.
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
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Server:</span>
                  {subscriptions.length === 0 ? (
                    <span className="text-sm text-gray-500">No servers available</span>
                  ) : subscriptions.length === 1 ? (
                    <span className="text-sm font-medium text-gray-900">
                      {subscriptions[0].serverName || `Server ${subscriptions[0].id.slice(0, 8)}`}
                    </span>
                  ) : (
                    <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                      <SelectTrigger className="h-8 w-[200px] text-sm">
                        <SelectValue placeholder="Select server" />
                      </SelectTrigger>
                      <SelectContent>
                        {subscriptions.map(sub => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.serverName || `Server ${sub.id.slice(0, 8)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                        Edit Inboxes
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        disabled={serverAtCapacity}
                        onClick={() => {
                          if (serverAtCapacity) {
                            setPageNotice({
                              type: "error",
                              text: "Server inbox limit reached. Purchase another server to add more inboxes.",
                            })
                            return
                          }
                          setShowAddInboxModal(true)
                        }}
                      >
                        Add inboxes
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowDeleteInboxModal(true)}>
                        Delete inboxes
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70"
                        disabled={exportingCsv}
                      >
                        {exportingCsv ? "Exporting…" : "Export to Sequencer"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        disabled={exportingCsv}
                        onClick={() => handleExportOption("Instantly")}
                      >
                        Instantly
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={exportingCsv}
                        onClick={() => handleExportOption("Smartlead")}
                      >
                        Smartlead
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <CardContent>
                <div className="border rounded-lg">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left" style={{ width: "40%" }}>
                          Email address
                        </TableHead>
                        <TableHead className="text-left" style={{ width: "20%" }}>
                          First name
                        </TableHead>
                        <TableHead className="text-left" style={{ width: "20%" }}>
                          Last name
                        </TableHead>
                        <TableHead className="text-left" style={{ width: "20%" }}>
                          Status
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingInboxes ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-12 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                              <p className="text-gray-600">Loading inboxes...</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : inboxesError ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <svg className="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-red-600 font-medium">Failed to load inboxes</p>
                              <p className="text-sm text-gray-600">{inboxesError}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : inboxesData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                              </svg>
                              <div>
                                <p className="text-gray-900 font-medium">No inboxes found</p>
                                <p className="text-gray-600 text-sm mt-1">
                                  This server doesn't have any inboxes configured yet
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        inboxesData.map((inbox) => (
                          <TableRow key={inbox.id}>
                            <TableCell className="font-mono text-sm">{inbox.email}</TableCell>
                            <TableCell className="text-sm text-gray-700">{inbox.firstName}</TableCell>
                            <TableCell className="text-sm text-gray-700">{inbox.lastName}</TableCell>
                            <TableCell>
                              <span
                                className={
                                  inbox.status === "active"
                                    ? "inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
                                    : "inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700"
                                }
                              >
                                {inbox.status}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end px-4 py-2 border-t">
                  <span
                    className={
                      (() => {
                        const selectedServer = subscriptions.find(sub => sub.id === selectedServerId)
                        const serverInboxLimit = selectedServer?.inboxLimit ?? 102
                        return inboxesData.length >= serverInboxLimit
                      })()
                        ? "text-sm text-red-600 font-semibold"
                        : "text-sm text-gray-900 font-semibold"
                    }
                  >
                    {(() => {
                      const selectedServer = subscriptions.find(sub => sub.id === selectedServerId)
                      const serverInboxLimit = selectedServer?.inboxLimit ?? 102
                      return `${inboxesData.length} / ${serverInboxLimit}`
                    })()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

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
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
          disabled
        >
          Inboxes
        </Button>
      </div>

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

      <Dialog open={showAddInboxModal} onOpenChange={setShowAddInboxModal}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Select your domains</DialogTitle>
              <Button
                onClick={handleOpenCreateInboxes}
                disabled={selectedDomainNames.size === 0 || serverAtCapacity}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Create inboxes
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            {domainFetchError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {domainFetchError}
              </div>
            )}
            {domainSelectionError && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {domainSelectionError}
              </div>
            )}

            <div className="space-y-4">
              {loadingDomains ? (
                <div className="flex items-center justify-center rounded-md border border-dashed border-gray-200 py-10">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="text-sm text-gray-600">Loading active domains…</p>
                  </div>
                </div>
              ) : availableDomains.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  No active domains are available for this server yet.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm font-semibold text-gray-900 mb-0">
                      Select domains to create inboxes
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">Inboxes per domain:</span>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((count) => {
                          const isActive = globalInboxCount === count
                          return (
                            <Button
                              key={`inbox-count-${count}`}
                              type="button"
                              variant={isActive ? "default" : "outline"}
                              size="sm"
                              className={isActive ? "bg-blue-600 hover:bg-blue-700 text-white" : "text-gray-700"}
                              onClick={() => handleGlobalInboxCountChange(String(count))}
                            >
                              {count}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    disabled={availableDomains.length === 0}
                    onClick={handleToggleSelectAllDomains}
                  >
                    {availableDomains.length > 0 && selectedDomainNames.size === availableDomains.length
                      ? "Deselect all"
                      : "Select all"}
                  </Button>
                  <div className="max-h-[260px] overflow-y-auto rounded-md border">
                    {availableDomains.map((domain) => {
                      const isSelected = selectedDomainNames.has(domain.domain_name)
                      const activeInboxCount = domain.inboxCount ?? 0
                      const remainingSlots = Math.max(0, MAX_INBOXES_PER_DOMAIN - activeInboxCount)
                      const isDisabled = remainingSlots === 0

                      return (
                        <div
                          key={domain.id}
                          className={`flex items-center gap-3 border-b last:border-b-0 p-3 text-sm ${
                            isDisabled ? "text-gray-400 bg-gray-50 cursor-not-allowed" : "text-gray-900 hover:bg-gray-50"
                          }`}
                        >
                          <Checkbox
                            id={`inbox-domain-${domain.id}`}
                            checked={isSelected}
                            disabled={isDisabled}
                            onCheckedChange={(checked) => toggleDomainSelection(domain.domain_name, Boolean(checked))}
                          />
                          <label
                            htmlFor={`inbox-domain-${domain.id}`}
                            className={`flex-1 ${
                              isDisabled ? "cursor-not-allowed text-gray-400" : "cursor-pointer text-gray-900"
                            }`}
                          >
                            <p className="font-medium">{domain.domain_name}</p>
                            <p className="text-xs text-gray-600">
                              {activeInboxCount} / {MAX_INBOXES_PER_DOMAIN} inboxes used • {remainingSlots} remaining
                            </p>
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateInboxReview} onOpenChange={setShowCreateInboxReview}>
        <DialogContent className="sm:max-w-[900px]">
          {Object.keys(inboxFormData).length === 0 ? (
            <p className="text-sm text-gray-600">
              Select at least one domain to configure inboxes.
            </p>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto space-y-4">
              <div className="border rounded-lg p-4 bg-white space-y-3 md:space-y-0">
                <p className="text-base font-semibold text-gray-900">Master inbox template</p>
                {bulkInboxTemplates.map((template, idx) => (
                  <div key={`bulk-template-${idx}`} className="grid gap-3 md:grid-cols-4">
                    <div className="flex items-center gap-2 md:col-span-2">
                      <Input
                        className="h-9 w-[140px]"
                        placeholder="Username"
                        value={template.username}
                        onChange={(e) => handleBulkTemplateChange(idx, "username", e.target.value)}
                      />
                      <span className="text-sm text-gray-600 whitespace-nowrap">@alldomains.com</span>
                    </div>
                    <Input
                      className="h-9"
                      placeholder="First name"
                      value={template.firstName}
                      onChange={(e) => handleBulkTemplateChange(idx, "firstName", e.target.value)}
                    />
                    <Input
                      className="h-9"
                      placeholder="Last name"
                      value={template.lastName}
                      onChange={(e) => handleBulkTemplateChange(idx, "lastName", e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900">Inboxes</p>
                {flattenedInboxRows.map(({ domain, index, entry }) => (
                  <div key={`${domain}-${index}`} className="grid gap-3 md:grid-cols-4">
                    <div className="flex items-center gap-2 md:col-span-2">
                      <Input
                        className="h-9 w-[140px]"
                        placeholder="Username"
                        value={entry.username}
                        onChange={(e) =>
                          handleInboxFieldChange(domain, index, "username", e.target.value)
                        }
                      />
                      <span className="text-sm text-gray-600 whitespace-nowrap">@{domain}</span>
                    </div>
                    <Input
                      className="h-9"
                      placeholder="First name"
                      value={entry.firstName}
                      onChange={(e) =>
                        handleInboxFieldChange(domain, index, "firstName", e.target.value)
                      }
                    />
                    <Input
                      className="h-9"
                      placeholder="Last name"
                      value={entry.lastName}
                      onChange={(e) =>
                        handleInboxFieldChange(domain, index, "lastName", e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>

              {creationError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {creationError}
                </div>
              )}

              {creationResults.length > 0 && (
                <div className="space-y-3 rounded-lg border bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">Creation results</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {creationResults.map((result) => (
                      <div
                        key={result.email}
                        className="flex flex-col gap-1 rounded-md border border-gray-200 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{result.email}</span>
                          <span
                            className={
                              result.status === "success"
                                ? "text-green-600 font-medium"
                                : "text-red-600 font-medium"
                            }
                          >
                            {result.status === "success" ? "Created" : "Failed"}
                          </span>
                        </div>
                        {result.password && (
                          <div className="text-xs text-gray-600">
                            Password: <span className="font-mono">{result.password}</span>
                          </div>
                        )}
                        {result.message && (
                          <div className="text-xs text-red-600">Error: {result.message}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateInboxReview(false)}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!canSubmit || creatingInboxes}
              onClick={handleConfirmCreateInboxes}
            >
              {creatingInboxes ? "Creating..." : "Confirm & create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={showDeleteInboxModal}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDeleteModal()
          } else {
            setShowDeleteInboxModal(open)
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Delete inboxes</DialogTitle>
            <DialogDescription>
              Select the inboxes you want to remove from this server.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              Any mailboxes deleted here cannot be recovered.
            </div>

            {deleteInboxesError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {deleteInboxesError}
              </div>
            )}

            {inboxesData.length === 0 ? (
              <p className="text-sm text-gray-600">
                This server doesn&apos;t have any inboxes to delete yet.
              </p>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-700">
                    {selectedInboxIds.size} selected
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllInboxes}
                  >
                    {selectedInboxIds.size === inboxesData.length
                      ? "Deselect all"
                      : "Select all"}
                  </Button>
                </div>

                <div className="max-h-[320px] overflow-y-auto space-y-2">
                  {inboxesData.map((inbox) => (
                    <div
                      key={inbox.id}
                      className="flex items-center gap-3 rounded-md border p-3"
                    >
                      <Checkbox
                        id={`delete-inbox-${inbox.id}`}
                        checked={selectedInboxIds.has(inbox.id)}
                        onCheckedChange={(checked) =>
                          toggleInboxSelection(inbox.id, Boolean(checked))
                        }
                      />
                      <label
                        htmlFor={`delete-inbox-${inbox.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {inbox.email}
                        </p>
                        <p className="text-xs text-gray-600">
                          {inbox.firstName} {inbox.lastName}
                        </p>
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}

            {deleteResults.length > 0 && deleteResults.every((result) => result.status === "success") && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                Selected mailboxes have been deleted successfully.
              </div>
            )}

            {deleteResults.length > 0 && (
              <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold text-gray-900">Deletion results</p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {deleteResults.map((result) => (
                    <div
                      key={result.email}
                      className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-gray-900">{result.email}</span>
                      <span
                        className={
                          result.status === "success"
                            ? "text-green-600 font-medium"
                            : "text-red-600 font-medium"
                        }
                      >
                        {result.status === "success" ? "Deleted" : `Failed: ${result.message ?? ""}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            {deleteResults.length > 0 ? (
              <Button onClick={handleCloseDeleteModal}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCloseDeleteModal}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={selectedInboxIds.size === 0 || deletingInboxes}
                  onClick={handleDeleteInboxes}
                >
                  {deletingInboxes ? "Deleting..." : `Delete ${selectedInboxIds.size || 0} inbox(es)`}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

