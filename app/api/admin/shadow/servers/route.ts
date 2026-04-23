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
    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 })
    }

    const servers = await prisma.server.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    })

    const formatted = servers.map((s) => ({
      id: s.id,
      subscriptionId: s.subscriptionId,
      organizationId: s.organizationId,
      serverName: s.serverName,
      ipAddress: s.ipAddress,
      status: s.status,
      domainLimit: s.domainLimit,
      inboxLimit: s.inboxLimit,
      createdAt: s.createdAt,
    }))

    return NextResponse.json({ servers: formatted })
  } catch (error) {
    console.error("Error in shadow/servers:", error)
    return NextResponse.json({ error: "Failed to fetch servers" }, { status: 500 })
  }
}
