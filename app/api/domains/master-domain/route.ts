import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { serverId, masterDomain, domainNames } = await request.json()

    if (!serverId || !masterDomain) {
      return NextResponse.json(
        { error: "Server ID and masterDomain are required" },
        { status: 400 }
      )
    }

    const trimmedMasterDomain = String(masterDomain).trim().toLowerCase()

    if (!trimmedMasterDomain) {
      return NextResponse.json(
        { error: "Master domain must be provided" },
        { status: 400 }
      )
    }

    // Find server by actual UUID (preferred) or legacy subscription ID
    let server = await prisma.server.findUnique({
      where: { id: serverId },
    })

    if (!server) {
      server = await prisma.server.findFirst({
        where: { subscriptionId: serverId },
      })
    }

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    // Ensure user has access to this server's org
    if (server.organizationId !== orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Determine which domains to update – restrict to the ones explicitly passed in
    let whereClause: any = { serverId: server.id }

    if (Array.isArray(domainNames) && domainNames.length > 0) {
      const normalizedNames = domainNames
        .map((d: string) => d.trim().toLowerCase())
        .filter(Boolean)

      whereClause = {
        ...whereClause,
        domainName: {
          in: normalizedNames,
        },
      }
    }

    const result = await prisma.domain.updateMany({
      where: whereClause,
      data: {
        masterDomain: trimmedMasterDomain,
      },
    })

    return NextResponse.json({
      success: true,
      updated: result.count,
      masterDomain: trimmedMasterDomain,
    })
  } catch (error: any) {
    console.error("Error saving master domain:", error)
    return NextResponse.json(
      {
        error: "Failed to save master domain",
        message: error?.message,
      },
      { status: 500 }
    )
  }
}


