import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const serverIdentifier = request.nextUrl.searchParams.get("serverId")
    if (!serverIdentifier) {
      return NextResponse.json({ error: "Server ID is required" }, { status: 400 })
    }

    let server = await prisma.server.findUnique({ where: { id: serverIdentifier } })
    if (!server) {
      server = await prisma.server.findFirst({ where: { subscriptionId: serverIdentifier } })
    }

    if (!server || server.organizationId !== orgId) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    const inboxes = await prisma.inbox.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({
      inboxes: inboxes.map((inbox) => ({
        id: inbox.id,
        email: inbox.email,
        domainName: inbox.domainName,
        firstName: inbox.firstName,
        lastName: inbox.lastName,
        status: inbox.status,
        createdAt: inbox.createdAt,
      })),
    })
  } catch (error: any) {
    console.error("Error fetching inboxes:", error)
    return NextResponse.json(
      { error: "Failed to fetch inboxes", message: error.message },
      { status: 500 }
    )
  }
}

