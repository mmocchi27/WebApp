import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

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

    const { subscriptionId, organizationId, serverName, ipAddress, apiKey, status } = await request.json()

    if (!subscriptionId || !organizationId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Check if server record already exists
    const existingServer = await prisma.server.findFirst({
      where: { subscriptionId }
    })

    let server
    if (existingServer) {
      // Update existing server
      server = await prisma.server.update({
        where: { id: existingServer.id },
        data: {
          serverName: serverName !== undefined ? serverName : existingServer.serverName,
          ipAddress: ipAddress !== undefined ? ipAddress : existingServer.ipAddress,
          apiKey: apiKey !== undefined ? apiKey : existingServer.apiKey,
          status: status || existingServer.status,
          updatedAt: new Date()
        }
      })
    } else {
      // Create new server
      server = await prisma.server.create({
        data: {
          subscriptionId,
          organizationId,
          serverName: serverName || null,
          ipAddress: ipAddress || null,
          apiKey: apiKey || null,
          status: status || 'pending'
        }
      })
    }

    return NextResponse.json({ success: true, server })
  } catch (error) {
    console.error("Error managing server:", error)
    return NextResponse.json({ error: "Failed to manage server" }, { status: 500 })
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

    const servers = await prisma.server.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ servers })
  } catch (error) {
    console.error("Error fetching all servers:", error)
    return NextResponse.json({ error: "Failed to fetch servers" }, { status: 500 })
  }
}

