"use client"

import { useUser, useOrganization, useOrganizationList, CreateOrganization, OrganizationSwitcher } from "@clerk/nextjs"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"

interface Subscription {
  id: string
  status: string
  current_period_end: number
  orderNumber: string
  serverName?: string
  domainList?: string
  ipAddress?: string
}

export default function Servers() {
  const { user } = useUser()
  const { organization, isLoaded: orgLoaded } = useOrganization()
  const { userMemberships, isLoaded: listLoaded, setActive } = useOrganizationList({
    userMemberships: {
      infinite: true,
    },
  })
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [serverNames, setServerNames] = useState<Record<string, string>>({})
  const [savingNames, setSavingNames] = useState<Set<string>>(new Set())
  const [domainLists, setDomainLists] = useState<Record<string, string>>({})
  const [ipAddresses, setIpAddresses] = useState<Record<string, string>>({})
  const [showOrgCreation, setShowOrgCreation] = useState(false)
  const [openingBilling, setOpeningBilling] = useState(false)
  const lastOrgIdRef = useRef<string | null>(null)

  // Force page refresh when org changes
  useEffect(() => {
    if (organization) {
      if (lastOrgIdRef.current && lastOrgIdRef.current !== organization.id) {
        // Org switched - force full page reload
        window.location.reload()
      }
      lastOrgIdRef.current = organization.id
    }
  }, [organization?.id])

  const fetchSubscriptions = useCallback(async () => {
    try {
      // Fetch subscriptions from Stripe
      const subsResponse = await fetch('/api/subscriptions')
      
      // Fetch server data from database
      const serversResponse = await fetch('/api/servers')
      
      if (subsResponse.ok && serversResponse.ok) {
        const subsData = await subsResponse.json()
        const serversData = await serversResponse.json()
        
        // Create a map of subscription ID to server data for easy lookup
        const serverMap = new Map()
        serversData.servers.forEach((server: any) => {
          serverMap.set(server.subscriptionId, server)
        })
        
        // Merge Stripe subscriptions with database server data
        const mergedSubscriptions = subsData.subscriptions
          .map((sub: Subscription) => {
            const serverData = serverMap.get(sub.id)
            
            return {
              ...sub,
              // Use status from database if available, otherwise fall back to Stripe status
              status: serverData?.status || sub.status,
              // Use serverName from database if available, otherwise fall back to Stripe metadata
              serverName: serverData?.serverName || sub.serverName,
              // Add IP address from database
              ipAddress: serverData?.ipAddress
            }
          })
          .filter((sub: Subscription) => sub.status !== 'cancelled') // Don't show cancelled servers
        
        setSubscriptions(mergedSubscriptions)
        
        // Extract server names and domain lists
        const names: Record<string, string> = {}
        const lists: Record<string, string> = {}
        const ips: Record<string, string> = {}
        
        mergedSubscriptions.forEach((sub: Subscription) => {
          if (sub.serverName) names[sub.id] = sub.serverName
          if (sub.domainList) lists[sub.id] = sub.domainList
          if (sub.ipAddress) ips[sub.id] = sub.ipAddress
        })
        
        setServerNames(names)
        setDomainLists(lists)
        setIpAddresses(ips)
      }
    } catch (error) {
      console.error('Error fetching subscriptions:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && orgLoaded && listLoaded) {
      // Check if user is a member of ANY organizations
      const hasOrgs = userMemberships && userMemberships.data && userMemberships.data.length > 0
      
      if (!hasOrgs) {
        // User is not a member of any org - show creation modal ONLY after checking
        // Add small delay to prevent flash
        setTimeout(() => {
          setShowOrgCreation(true)
          setLoading(false)
        }, 100)
      } else if (!organization) {
        // User has orgs but no active org - set the first one as active
        const firstOrg = userMemberships.data[0].organization
        setActive({ organization: firstOrg.id })
          .then(() => {
            // Force reload after setting active org
            window.location.reload()
          })
      } else {
        // Has active organization - fetch subscriptions normally
        setShowOrgCreation(false)
        fetchSubscriptions()
      }
    }
  }, [user, organization, orgLoaded, listLoaded, userMemberships, setActive, fetchSubscriptions])

  const handleServerNameChange = (subscriptionId: string, value: string) => {
    setServerNames(prev => ({
      ...prev,
      [subscriptionId]: value
    }))
  }

  const handleServerNameSave = async (subscriptionId: string) => {
    const serverName = serverNames[subscriptionId]
    if (!serverName) return

    setSavingNames(prev => new Set(prev).add(subscriptionId))
    
    try {
      const response = await fetch('/api/update-subscription-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionId,
          metadata: { serverName }
        }),
      })

      if (response.ok) {
        // Update the subscription in our state
        setSubscriptions(prev => prev.map(sub => 
          sub.id === subscriptionId 
            ? { ...sub, serverName }
            : sub
        ))
      } else {
        console.error('Failed to save server name')
      }
    } catch (error) {
      console.error('Error saving server name:', error)
    } finally {
      setSavingNames(prev => {
        const newSet = new Set(prev)
        newSet.delete(subscriptionId)
        return newSet
      })
    }
  }



  const formatDate = (timestamp: number) => {
    if (!timestamp || timestamp === 0) {
      return "N/A"
    }
    return new Date(timestamp * 1000).toLocaleDateString()
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'text-green-600 bg-green-100'
      case 'pending':
        return 'text-yellow-600 bg-yellow-100'
      case 'suspended':
      case 'canceled':
        return 'text-red-600 bg-red-100'
      case 'past_due':
        return 'text-orange-600 bg-orange-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const handleOpenBilling = async () => {
    setOpeningBilling(true)
    try {
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/servers`
        }),
      })

      const data = await response.json()

      if (response.ok) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Failed to open billing portal')
        setOpeningBilling(false)
      }
    } catch (error) {
      console.error('Error opening billing portal:', error)
      alert('Failed to open billing portal. Please try again.')
      setOpeningBilling(false)
    }
  }

  // Show org creation modal ONLY if user is not a member of any orgs
  // Also ensure we're done loading before showing it
  const hasOrgs = userMemberships && userMemberships.data && userMemberships.data.length > 0
  if (showOrgCreation && !hasOrgs && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-4xl px-4 sm:px-6 lg:px-8">
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
            <UserButton afterSignOutUrl="/" />
          </div>

          {/* Welcome Message */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to MailMountains!</h1>
            <p className="text-gray-600">Let's create your organization to get started</p>
          </div>

          {/* Org Creation Component */}
          <div className="flex justify-center">
            <Card className="w-full">
              <CardContent className="py-8 flex justify-center">
                <div className="w-full max-w-md">
                  <CreateOrganization 
                    skipInvitationScreen={true}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* Left Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 min-h-screen" />
        
        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading subscriptions...</p>
          </div>
        </div>
      </div>
    )
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
              onClick={() => router.push("/checkout")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
            >
              Provision Dedicated Server
            </Button>
            <OrganizationSwitcher 
              hidePersonal={true}
              afterSelectOrganizationUrl="/servers"
              afterCreateOrganizationUrl="/servers"
            />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Servers</h1>
        </div>

        {/* Subscriptions */}
        <Card>
          <CardContent>
            {subscriptions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No subscriptions found.</p>
                <Button 
                  onClick={() => router.push("/checkout")}
                  className="mt-4 bg-blue-600 hover:bg-blue-700"
                >
                  Get Started
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Table Header */}
                <div className="grid grid-cols-3 gap-4 px-4 py-3 bg-gray-50 rounded-md font-medium text-sm text-gray-700">
                  <div className="text-center">Server Name</div>
                  <div className="text-center">Status</div>
                  <div className="text-center">IP Address</div>
                </div>
                
                {subscriptions.map((subscription) => (
                  <div 
                    key={subscription.id}
                    className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-gray-200 items-center"
                  >
                    <div className="text-center">
                      <input
                        type="text"
                        value={serverNames[subscription.id] || ""}
                        onChange={(e) => handleServerNameChange(subscription.id, e.target.value)}
                        placeholder="e.g., Production Server"
                        className="text-gray-600 text-center bg-transparent border-none outline-none focus:text-gray-900 focus:underline w-full"
                        onBlur={() => handleServerNameSave(subscription.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleServerNameSave(subscription.id)}
                        disabled={savingNames.has(subscription.id)}
                      />
                      {savingNames.has(subscription.id) && (
                        <div className="text-xs text-blue-600 mt-1">Saving...</div>
                      )}
                    </div>
                    <div className="text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(subscription.status)}`}>
                        {subscription.status}
                      </span>
                    </div>
                    <div className="text-gray-600 text-center">
                      {ipAddresses[subscription.id] || "Not assigned"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Top Left Navigation Buttons */}
      <div className="fixed top-8 left-8 flex flex-col gap-4">
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
          disabled
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
          onClick={handleOpenBilling}
          disabled={openingBilling}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
        >
          {openingBilling ? "Opening..." : "Billing"}
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

