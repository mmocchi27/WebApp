"use client"

import { useUser } from "@clerk/nextjs"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

interface Subscription {
  id: string
  status: string
  current_period_end: number
  orderNumber: string
  serverName?: string
  domainList?: string
}

export default function Dashboard() {
  const { user } = useUser()
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [serverNames, setServerNames] = useState<Record<string, string>>({})
  const [savingNames, setSavingNames] = useState<Set<string>>(new Set())
  const [domainLists, setDomainLists] = useState<Record<string, string>>({})

  useEffect(() => {
    if (user) {
      fetchSubscriptions()
    }
  }, [user])

  const fetchSubscriptions = async () => {
    try {
      const response = await fetch('/api/subscriptions')
      if (response.ok) {
        const data = await response.json()
        setSubscriptions(data.subscriptions)
        
        // Extract server names and domain lists from subscription metadata
        const names: Record<string, string> = {}
        const lists: Record<string, string> = {}
        
        data.subscriptions.forEach((sub: Subscription) => {
          if (sub.serverName) names[sub.id] = sub.serverName
          if (sub.domainList) lists[sub.id] = sub.domainList
        })
        
        setServerNames(names)
        setDomainLists(lists)
      }
    } catch (error) {
      console.error('Error fetching subscriptions:', error)
    } finally {
      setLoading(false)
    }
  }

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
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-100'
      case 'canceled':
        return 'text-red-600 bg-red-100'
      case 'past_due':
        return 'text-yellow-600 bg-yellow-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading subscriptions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
            
            <div className="ml-4">
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-2">Manage your subscriptions and servers</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => router.push("/checkout")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
            >
              Provision Dedicated Server
            </Button>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        {/* Subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle>Your Subscriptions</CardTitle>
          </CardHeader>
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
                <div className="grid grid-cols-6 gap-4 px-4 py-3 bg-gray-50 rounded-md font-medium text-sm text-gray-700">
                  <div>Order Number</div>
                  <div>Server Name</div>
                  <div>Domain/Contact List</div>
                  <div>Status</div>
                  <div>Current Period End</div>
                  <div>Actions</div>
                </div>
                
                {subscriptions.map((subscription) => (
                  <Accordion key={subscription.id} type="single" collapsible>
                    <AccordionItem value={subscription.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="grid grid-cols-6 gap-4 w-full text-left">
                          <div className="font-medium">{subscription.orderNumber}</div>
                          <div>
                            <Input
                              value={serverNames[subscription.id] || ""}
                              onChange={(e) => handleServerNameChange(subscription.id, e.target.value)}
                              placeholder="e.g., Production Server"
                              className="max-w-32 text-sm"
                              onBlur={() => handleServerNameSave(subscription.id)}
                              onKeyDown={(e) => e.key === 'Enter' && handleServerNameSave(subscription.id)}
                              disabled={savingNames.has(subscription.id)}
                            />
                            {savingNames.has(subscription.id) && (
                              <div className="text-xs text-blue-600 mt-1">Saving...</div>
                            )}
                          </div>
                                                     <div>
                             {domainLists[subscription.id] ? (
                               <a
                                 href={domainLists[subscription.id]}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="text-blue-600 hover:text-blue-800 underline text-sm"
                                 title={domainLists[subscription.id]}
                               >
                                 Click Here
                               </a>
                             ) : (
                               <span className="text-gray-400 text-sm">—</span>
                             )}
                           </div>
                          <div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(subscription.status)}`}>
                              {subscription.status}
                            </span>
                          </div>
                          <div className="text-gray-600">
                            {formatDate(subscription.current_period_end)}
                          </div>
                                                     <div>
                             <Button
                               variant="outline"
                               size="sm"
                               className="text-red-600 hover:text-red-700 hover:bg-red-50"
                               onClick={async () => {
                                 if (confirm('Are you sure you want to cancel this subscription?')) {
                                   try {
                                     const response = await fetch('/api/cancel-subscription', {
                                       method: 'POST',
                                       headers: {
                                         'Content-Type': 'application/json',
                                       },
                                       body: JSON.stringify({
                                         subscriptionId: subscription.id
                                       }),
                                     })
                                     
                                     if (response.ok) {
                                       // Refresh the subscriptions list
                                       fetchSubscriptions()
                                     } else {
                                       const errorData = await response.json()
                                       alert(`Failed to cancel subscription: ${errorData.error}`)
                                     }
                                   } catch (error) {
                                     console.error('Error canceling subscription:', error)
                                     alert('Failed to cancel subscription. Please try again.')
                                   }
                                 }
                               }}
                             >
                               Cancel
                             </Button>
                           </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pt-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">Subscription ID:</span>
                              <p className="text-gray-600 font-mono">{subscription.id}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Status:</span>
                              <p className="text-gray-600 capitalize">{subscription.status}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Current Period End:</span>
                              <p className="text-gray-600">{formatDate(subscription.current_period_end)}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Next Billing Date:</span>
                              <p className="text-gray-600">{formatDate(subscription.current_period_end)}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Order Number:</span>
                              <p className="text-gray-600">{subscription.orderNumber}</p>
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
