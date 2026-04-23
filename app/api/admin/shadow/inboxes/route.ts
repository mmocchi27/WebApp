import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

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
    const serverId = request.nextUrl.searchParams.get("serverId")?.trim()
    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 })
    }

    if (serverId) {
      // Verify this server belongs to the org
      const server = await prisma.server.findUnique({ where: { id: serverId } })
      if (!server || server.organizationId !== orgId) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 })
      }

      const inboxes = await prisma.inbox.findMany({
        where: { serverId },
        orderBy: { createdAt: "desc" },
      })

      return NextResponse.json({
        inboxes: inboxes.map((i) => ({
          id: i.id,
          email: i.email,
          domainName: i.domainName,
          firstName: i.firstName,
          lastName: i.lastName,
          status: i.status,
          createdAt: i.createdAt,
        })),
      })
    }

    // No serverId — return active servers only for the selector
    const servers = await prisma.server.findMany({
      where: { organizationId: orgId, status: "active" },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({
      servers: servers.map((s) => ({
        id: s.id,
        serverName: s.serverName,
        ipAddress: s.ipAddress,
        status: s.status,
        domainLimit: s.domainLimit,
        inboxLimit: s.inboxLimit,
        subscriptionId: s.subscriptionId,
      })),
    })
  } catch (error) {
    console.error("Error in shadow/inboxes:", error)
    return NextResponse.json({ error: "Failed to fetch inboxes" }, { status: 500 })
  }
}
