import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { cleanupServerResources } from "@/lib/serverCleanup"

// Helper function to check if user is admin
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress
    const adminEmail = process.env.ADMIN_EMAIL || 'mitch@mailmountains.com'
    return userEmail === adminEmail
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}

// POST - Create or update a server record
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin
    if (!await isAdmin(userId)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const {
      subscriptionId,
      organizationId,
      serverName,
      ipAddress,
      apiKey,
      hostname,
      status,
      domainLimit,
      inboxLimit,
    } = await request.json()

    if (!subscriptionId || !organizationId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Parse and validate limits
    const parsedDomainLimit =
      typeof domainLimit === "number" && Number.isFinite(domainLimit) && domainLimit > 0
        ? Math.floor(domainLimit)
        : undefined
    const parsedInboxLimit =
      typeof inboxLimit === "number" && Number.isFinite(inboxLimit) && inboxLimit > 0
        ? Math.floor(inboxLimit)
        : undefined

    // Check if server record already exists
    const existingServer = await prisma.server.findFirst({
      where: { subscriptionId }
    })

    let server
    if (existingServer) {
      const statusNormalized = status?.toLowerCase()
      const wasCancelled = existingServer.status?.toLowerCase() === "cancelled"
      const shouldTriggerCleanup = statusNormalized === "cancelled" && !wasCancelled

      // Update existing server
      server = await prisma.server.update({
        where: { id: existingServer.id },
        data: {
          serverName: serverName !== undefined ? serverName : existingServer.serverName,
          ipAddress: ipAddress !== undefined ? ipAddress : existingServer.ipAddress,
          apiKey: apiKey !== undefined ? apiKey : existingServer.apiKey,
          hostname: hostname !== undefined ? hostname : existingServer.hostname,
          status: status || existingServer.status,
          domainLimit: parsedDomainLimit ?? existingServer.domainLimit,
          inboxLimit: parsedInboxLimit ?? existingServer.inboxLimit,
          updatedAt: new Date()
        }
      })

      if (shouldTriggerCleanup) {
        try {
          await cleanupServerResources({
            id: server.id,
            subscriptionId: server.subscriptionId,
            ipAddress: server.ipAddress,
            apiKey: server.apiKey,
          })
        } catch (error: any) {
          console.error("Error cleaning up server resources:", error)
          return NextResponse.json(
            { error: "Failed to clean up server resources", details: error.message },
            { status: 500 }
          )
        }
      }
    } else {
      // Create new server
      server = await prisma.server.create({
        data: {
          subscriptionId,
          organizationId,
          serverName: serverName || null,
          ipAddress: ipAddress || null,
          apiKey: apiKey || null,
          hostname: hostname || null,
          status: status || 'pending',
          domainLimit: parsedDomainLimit ?? 34,
          inboxLimit: parsedInboxLimit ?? 102,
        }
      })
    }

    return NextResponse.json({ success: true, server })
  } catch (error: any) {
    console.error("Error managing server:", error)
    console.error("Error message:", error.message)
    console.error("Error stack:", error.stack)
    return NextResponse.json({ 
      error: "Failed to manage server",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}

// GET - Fetch all servers (admin view)
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin
    if (!await isAdmin(userId)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const orgId = searchParams.get("orgId")?.trim()

    const servers = await prisma.server.findMany({
      where: orgId ? { organizationId: orgId } : undefined,
      orderBy: {
        createdAt: 'desc'
      }
    })

    const filteredServers = orgId
      ? servers.filter(server => {
          const normalizedStatus = server.status?.toLowerCase()
          return normalizedStatus === 'active' || normalizedStatus === 'pending'
        })
      : servers

    return NextResponse.json({ servers: filteredServers })
  } catch (error) {
    console.error("Error fetching all servers:", error)
    return NextResponse.json({ error: "Failed to fetch servers" }, { status: 500 })
  }
}

