import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmail = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId
    )?.emailAddress
    const adminEmail = process.env.ADMIN_EMAIL || "mitch@mailmountains.com"
    return userEmail === adminEmail
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const orgId = request.nextUrl.searchParams.get("orgId")?.trim()
    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 })
    }

    const client = await clerkClient()

    const [membershipsResult, invitationsResult, orgResult] = await Promise.allSettled([
      client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 500 }),
      client.organizations.getOrganizationInvitationList({ organizationId: orgId, limit: 500 }),
      client.organizations.getOrganization({ organizationId: orgId }),
    ])

    const members =
      membershipsResult.status === "fulfilled"
        ? membershipsResult.value.data.map((m) => ({
            id: m.id,
            role: m.role,
            createdAt: m.createdAt,
            firstName: m.publicUserData?.firstName ?? "",
            lastName: m.publicUserData?.lastName ?? "",
            identifier: m.publicUserData?.identifier ?? "",
            userId: m.publicUserData?.userId ?? "",
          }))
        : []

    const pendingInvitations =
      invitationsResult.status === "fulfilled"
        ? invitationsResult.value.data
            .filter((inv) => (inv as any).status === "pending" || !(inv as any).status)
            .map((inv) => ({
              id: inv.id,
              emailAddress: inv.emailAddress,
              role: inv.role,
              createdAt: inv.createdAt,
              expiresAt: (inv as any).expiresAt ?? null,
            }))
        : []

    const org =
      orgResult.status === "fulfilled"
        ? { id: orgResult.value.id, name: orgResult.value.name }
        : { id: orgId, name: orgId }

    return NextResponse.json({ org, members, pendingInvitations })
  } catch (error) {
    console.error("Error in shadow/users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}
