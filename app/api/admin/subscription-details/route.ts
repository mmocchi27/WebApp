import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
    const adminEmail = process.env.ADMIN_EMAIL || "mitch@mailmountains.com"
    return userEmail === adminEmail
  } catch (error) {
    console.error("Error checking admin status:", error)
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
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const subscriptionId = request.nextUrl.searchParams.get("subscriptionId")?.trim()
    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId parameter" }, { status: 400 })
    }

    const server = await prisma.server.findFirst({
      where: { subscriptionId },
      select: {
        id: true,
        subscriptionId: true,
        organizationId: true,
        serverName: true,
        status: true,
        domains: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            domainName: true,
            cloudflareStatus: true,
            dnsConfigured: true,
            nameservers: true,
            mxRecord: true,
            spfRecord: true,
            dmarcRecord: true,
            dkimRecord: true,
            masterDomain: true,
            redirectConfigured: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        inboxes: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            domainName: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    })

    if (!server) {
      return NextResponse.json({ error: "No server found for that subscription ID" }, { status: 404 })
    }

    return NextResponse.json({
      server: {
        id: server.id,
        subscriptionId: server.subscriptionId,
        organizationId: server.organizationId,
        serverName: server.serverName,
        status: server.status,
      },
      domains: server.domains,
      inboxes: server.inboxes,
    })
  } catch (error) {
    console.error("Error fetching subscription details:", error)
    return NextResponse.json({ error: "Failed to fetch subscription details" }, { status: 500 })
  }
}


