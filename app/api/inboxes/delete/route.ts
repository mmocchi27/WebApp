import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import axios from "axios"
import https from "https"

interface DeletePayload {
  serverId: string
  inboxIds: string[]
}

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: DeletePayload = await request.json()
    const { serverId, inboxIds } = body

    if (!serverId || !Array.isArray(inboxIds) || inboxIds.length === 0) {
      return NextResponse.json(
        { error: "Server ID and inbox IDs are required" },
        { status: 400 }
      )
    }

    let server = await prisma.server.findUnique({ where: { id: serverId } })
    if (!server) {
      server = await prisma.server.findFirst({ where: { subscriptionId: serverId } })
    }
    if (!server || server.organizationId !== orgId) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    if (!server.ipAddress || !server.apiKey) {
      return NextResponse.json(
        { error: "Server is missing Mailcow credentials" },
        { status: 400 }
      )
    }

    const inboxes = await prisma.inbox.findMany({
      where: {
        id: { in: inboxIds },
        serverId: server.id,
      },
    })

    if (inboxes.length === 0) {
      return NextResponse.json({ error: "No inboxes found" }, { status: 404 })
    }

    const httpsAgent = new https.Agent({ rejectUnauthorized: false })
    const results: Array<{ email: string; status: "success" | "error"; message?: string }> = []

    for (const inbox of inboxes) {
      try {
        await axios.post(
          `https://${server.ipAddress}/api/v1/delete/mailbox`,
          [inbox.email],
          {
            headers: {
              "X-API-Key": server.apiKey,
              "Content-Type": "application/json",
            },
            timeout: 30000,
            httpsAgent,
          }
        )

        await prisma.inbox.delete({ where: { id: inbox.id } })
        results.push({ email: inbox.email, status: "success" })
      } catch (error: any) {
        const message =
          error.response?.data?.error ||
          error.message ||
          "Failed to delete inbox"

        results.push({ email: inbox.email, status: "error", message })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    console.error("Error deleting inboxes:", error)
    return NextResponse.json(
      { error: "Failed to delete inboxes", message: error.message },
      { status: 500 }
    )
  }
}

