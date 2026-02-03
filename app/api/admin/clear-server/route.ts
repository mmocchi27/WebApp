import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { cleanupServerResources } from "@/lib/serverCleanup"

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

    const { serverId } = await request.json()

    if (!serverId) {
      return NextResponse.json({ error: "Server ID is required" }, { status: 400 })
    }

    // Get the server
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    })

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    console.log(`Admin clearing server ${server.id} (${server.serverName})`)

    // Clear all domains and inboxes
    await cleanupServerResources(server)

    console.log(`✅ Server ${server.id} cleared successfully`)

    return NextResponse.json({ 
      success: true,
      message: "Server cleared successfully" 
    })
  } catch (error) {
    console.error("Error clearing server:", error)
    return NextResponse.json({ error: "Failed to clear server" }, { status: 500 })
  }
}

