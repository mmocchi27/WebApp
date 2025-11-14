"use client"

import { useUser } from "@clerk/nextjs"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

interface Server {
  id: string
  subscriptionId: string
  organizationId: string
  serverName: string | null
  ipAddress: string | null
  apiKey: string | null
  hostname: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export default function AdminServers() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [editingServer, setEditingServer] = useState<string | null>(null)
  const [formData, setFormData] = useState<{[key: string]: {serverName: string, ipAddress: string, apiKey: string, hostname: string, status: string}}>({})

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

  useEffect(() => {
    if (isLoaded && user) {
      fetchServers()
    }
  }, [isLoaded, user])

  const fetchServers = async () => {
    try {
      const response = await fetch('/api/admin/servers')
      if (response.ok) {
        const data = await response.json()
        setServers(data.servers)
        
        // Initialize form data
        const initialFormData: {[key: string]: {serverName: string, ipAddress: string, apiKey: string, hostname: string, status: string}} = {}
        data.servers.forEach((server: Server) => {
          initialFormData[server.id] = {
            serverName: server.serverName || '',
            ipAddress: server.ipAddress || '',
            apiKey: server.apiKey || '',
            hostname: server.hostname || '',
            status: server.status
          }
        })
        setFormData(initialFormData)
      }
    } catch (error) {
      console.error('Error fetching servers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (serverId: string, subscriptionId: string, organizationId: string) => {
    try {
      const response = await fetch('/api/admin/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionId,
          organizationId,
          serverName: formData[serverId].serverName,
          ipAddress: formData[serverId].ipAddress,
          apiKey: formData[serverId].apiKey,
          hostname: formData[serverId].hostname,
          status: formData[serverId].status
        }),
      })

      if (response.ok) {
        alert('Server updated successfully!')
        setEditingServer(null)
        fetchServers()
      } else {
        const errorData = await response.json()
        console.error('Server update error:', errorData)
        alert(`Failed to update server: ${errorData.details || errorData.error}`)
      }
    } catch (error) {
      console.error('Error updating server:', error)
      alert('Failed to update server: ' + error)
    }
  }

  const handleChange = (serverId: string, field: 'serverName' | 'ipAddress' | 'apiKey' | 'hostname' | 'status', value: string) => {
    setFormData(prev => ({
      ...prev,
      [serverId]: {
        ...prev[serverId],
        [field]: value
      }
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading servers...</p>
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
              <span className="font-semibold text-gray-900">MailMountains Admin</span>
            </div>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>

        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Server Management</h1>
          <p className="text-gray-600 mt-2">Assign IP addresses and API keys to customer servers</p>
        </div>

        {/* Servers Table */}
        <Card>
          <CardContent className="p-0">
            {servers.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-gray-500">No servers found.</p>
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated At</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {servers.map((server) => (
                      <tr key={server.id} className="hover:bg-gray-50">
                        <td className="px-2 py-3 text-xs font-mono text-gray-900 break-all max-w-[100px]">{server.id}</td>
                        <td className="px-2 py-3 text-xs font-mono text-gray-900 break-all max-w-[120px]">{server.subscriptionId}</td>
                        <td className="px-2 py-3 text-xs font-mono text-gray-900 break-all max-w-[120px]">{server.organizationId}</td>
                        <td className="px-4 py-3 text-sm">
                          {editingServer === server.id ? (
                            <Input
                              value={formData[server.id]?.serverName || ''}
                              onChange={(e) => handleChange(server.id, 'serverName', e.target.value)}
                              placeholder="Server name"
                              className="w-full"
                            />
                          ) : (
                            <span>{server.serverName || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {editingServer === server.id ? (
                            <Input
                              value={formData[server.id]?.ipAddress || ''}
                              onChange={(e) => handleChange(server.id, 'ipAddress', e.target.value)}
                              placeholder="192.168.1.1"
                              className="w-full"
                            />
                          ) : (
                            <span className="font-mono">{server.ipAddress || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {editingServer === server.id ? (
                            <Input
                              value={formData[server.id]?.apiKey || ''}
                              onChange={(e) => handleChange(server.id, 'apiKey', e.target.value)}
                              placeholder="sk_..."
                              type="password"
                              className="w-full"
                            />
                          ) : (
                            <span className="font-mono">{server.apiKey ? '••••••••' : '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {editingServer === server.id ? (
                            <Input
                              value={formData[server.id]?.hostname || ''}
                              onChange={(e) => handleChange(server.id, 'hostname', e.target.value)}
                              placeholder="mail.example.com"
                              className="w-full"
                            />
                          ) : (
                            <span className="font-mono">{server.hostname || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {editingServer === server.id ? (
                            <select
                              value={formData[server.id]?.status || 'pending'}
                              onChange={(e) => handleChange(server.id, 'status', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                            >
                              <option value="pending">Pending</option>
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                            </select>
                          ) : (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              server.status === 'active' ? 'bg-green-100 text-green-800' :
                              server.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {server.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{new Date(server.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{new Date(server.updatedAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm">
                          {editingServer === server.id ? (
                            <div className="flex gap-1">
                              <Button
                                onClick={() => handleUpdate(server.id, server.subscriptionId, server.organizationId)}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                Save
                              </Button>
                              <Button
                                onClick={() => setEditingServer(null)}
                                size="sm"
                                variant="outline"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              onClick={() => setEditingServer(server.id)}
                              size="sm"
                              variant="outline"
                            >
                              Edit
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

