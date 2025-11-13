"use client"

import { useUser, useOrganization, CreateOrganization } from "@clerk/nextjs"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

export default function UserManagement() {
  const { user } = useUser()
  const { organization, isLoaded } = useOrganization()
  const router = useRouter()
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([])
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"org:admin" | "org:member">("org:member")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState("")
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [openingBilling, setOpeningBilling] = useState(false)

  // Fetch members and invitations when organization loads
  useEffect(() => {
    async function fetchData() {
      if (!organization) {
        return
      }
      
      setLoadingMembers(true)
      try {
        const membershipList = await organization.getMemberships()
        setMembers(membershipList.data || [])
        
        const invitationList = await organization.getInvitations({ status: 'pending' })
        setPendingInvitations(invitationList.data || [])
      } catch (error) {
        console.error('Error fetching data:', error)
        setMembers([])
        setPendingInvitations([])
      } finally {
        setLoadingMembers(false)
      }
    }

    if (organization) {
      fetchData()
    }
  }, [organization?.id])

  const handleInviteUser = async () => {
    if (!organization || !inviteEmail) {
      return
    }

    setInviting(true)
    setInviteError("")

    try {
      await organization.inviteMember({
        emailAddress: inviteEmail,
        role: inviteRole
      })
      
      // Success - refresh members and invitations lists
      const membershipList = await organization.getMemberships()
      setMembers(membershipList.data || [])
      
      const invitationList = await organization.getInvitations({ status: 'pending' })
      setPendingInvitations(invitationList.data || [])
      
      // Reset form
      setInviteEmail("")
      setInviteRole("org:member")
      setShowInviteForm(false)
      
      alert("Invitation sent successfully!")
    } catch (error: any) {
      setInviteError(error.errors?.[0]?.message || error.message || "Failed to send invitation")
    } finally {
      setInviting(false)
    }
  }

  const handleRevokeInvite = async (invitation: any) => {
    if (!organization) return

    const confirmed = confirm(`Are you sure you want to revoke the invitation for ${invitation.emailAddress}?`)
    if (!confirmed) return

    setRevokingInviteId(invitation.id)
    try {
      await invitation.revoke()
      
      // Refresh invitations list and filter to only pending
      const invitationList = await organization.getInvitations({ status: 'pending' })
      setPendingInvitations(invitationList.data || [])
      
      alert("Invitation revoked successfully!")
    } catch (error: any) {
      console.error('Error revoking invitation:', error)
      alert(error.errors?.[0]?.message || error.message || "Failed to revoke invitation")
    } finally {
      setRevokingInviteId(null)
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
          returnUrl: `${window.location.origin}/user-management`
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

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* Left Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 min-h-screen" />
        
        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
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
                onClick={() => router.push("/servers")}
                variant="outline"
              >
                Back to Servers
              </Button>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>

          {/* Page Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          </div>

          {/* Content */}
          {showCreateOrg ? (
            <Card>
              <CardContent className="py-8">
                <CreateOrganization 
                  afterCreateOrganizationUrl="/user-management"
                  skipInvitationScreen={true}
                />
              </CardContent>
            </Card>
          ) : organization ? (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>{organization.name} - Members</CardTitle>
                  <Button 
                    onClick={() => setShowInviteForm(!showInviteForm)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {showInviteForm ? "Cancel" : "Add User"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Invite Form */}
                {showInviteForm && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4">Invite User to Organization</h3>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="invite-email">Email Address</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          placeholder="user@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          disabled={inviting}
                        />
                      </div>
                      <div>
                        <Label htmlFor="invite-role">Role</Label>
                        <Select
                          value={inviteRole}
                          onValueChange={(value) => setInviteRole(value as "org:admin" | "org:member")}
                          disabled={inviting}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="org:member">Member</SelectItem>
                            <SelectItem value="org:admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {inviteError && (
                        <div className="text-sm text-red-600">{inviteError}</div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={handleInviteUser}
                          disabled={!inviteEmail || inviting}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {inviting ? "Sending..." : "Send Invitation"}
                        </Button>
                        <Button
                          onClick={() => {
                            setShowInviteForm(false)
                            setInviteEmail("")
                            setInviteError("")
                          }}
                          variant="outline"
                          disabled={inviting}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Members List */}
                {loadingMembers ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading members...</p>
                  </div>
                ) : members.length > 0 ? (
                  <div className="space-y-4">
                    {/* Table Header */}
                    <div className="grid grid-cols-4 gap-4 px-4 py-3 bg-gray-50 rounded-md font-medium text-sm text-gray-700">
                      <div>Name</div>
                      <div>Email</div>
                      <div>Role</div>
                      <div>Joined</div>
                    </div>
                    
                    {/* Members */}
                    {members.map((membership) => (
                      <div 
                        key={membership.id}
                        className="grid grid-cols-4 gap-4 px-4 py-3 border-b border-gray-200 items-center"
                      >
                        <div className="font-medium">
                          {membership.publicUserData?.firstName || ''} {membership.publicUserData?.lastName || ''}
                        </div>
                        <div className="text-gray-600">
                          {membership.publicUserData?.identifier || ''}
                        </div>
                        <div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            membership.role === 'org:admin' 
                              ? 'bg-purple-100 text-purple-700' 
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {membership.role.replace('org:', '')}
                          </span>
                        </div>
                        <div className="text-gray-600 text-sm">
                          {new Date(membership.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No members found in this organization.</p>
                  </div>
                )}

                {/* Pending Invitations Section */}
                {pendingInvitations.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <h3 className="text-lg font-semibold mb-4">Pending Invitations</h3>
                    <div className="space-y-2">
                      {pendingInvitations.map((invitation) => (
                        <div 
                          key={invitation.id}
                          className="flex items-center justify-between px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-md"
                        >
                          <div>
                            <p className="font-medium text-gray-900">{invitation.emailAddress}</p>
                            <p className="text-sm text-gray-500">
                              Invited as {invitation.role.replace('org:', '')} • 
                              {' '}Sent {new Date(invitation.createdAt).toLocaleDateString()}
                              {invitation.expiresAt && (
                                <>
                                  {' '}• Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                              Pending
                            </span>
                            <Button
                              onClick={() => handleRevokeInvite(invitation)}
                              disabled={revokingInviteId === invitation.id}
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {revokingInviteId === invitation.id ? "Revoking..." : "Revoke"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
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
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" 
                    />
                  </svg>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Create Your Organization</h2>
                  <p className="text-gray-600 mb-6">
                    Get started by creating your personal organization to manage subscriptions and team members.
                  </p>
                  <Button 
                    onClick={() => setShowCreateOrg(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Create Organization
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Servers Button - Fixed Top Left */}
      <div className="fixed top-8 left-8">
        <Button
          onClick={() => router.push("/servers")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
        >
          Servers
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
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium shadow-lg w-[200px]"
          disabled
        >
          User Management
        </Button>
      </div>
    </div>
  )
}

