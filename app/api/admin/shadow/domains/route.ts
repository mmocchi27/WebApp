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

      const domains = await prisma.domain.findMany({
        where: { serverId },
        orderBy: { createdAt: "desc" },
      })

      const inboxCounts = await prisma.inbox.groupBy({
        by: ["domainName"],
        where: { serverId, status: { not: "failed" } },
        _count: { domainName: true },
      })
      const inboxCountMap = new Map(inboxCounts.map((e) => [e.domainName.toLowerCase(), e._count.domainName]))

      return NextResponse.json({
        domains: domains.map((d) => ({
          id: d.id,
          domain_name: d.domainName,
          cloudflareStatus: d.cloudflareStatus,
          dnsConfigured: d.dnsConfigured,
          nameservers: d.nameservers,
          masterDomain: d.masterDomain,
          redirectConfigured: d.redirectConfigured,
          mxRecord: d.mxRecord,
          spfRecord: d.spfRecord,
          dmarcRecord: d.dmarcRecord,
          dkimRecord: d.dkimRecord,
          lastCheckedAt: d.lastCheckedAt,
          inboxCount: inboxCountMap.get(d.domainName.toLowerCase()) ?? 0,
          createdAt: d.createdAt,
          active: d.cloudflareStatus === "active" ? 1 : 0,
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
    console.error("Error in shadow/domains:", error)
    return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 })
  }
}
