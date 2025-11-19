import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's organization
    let organizationId = orgId
    
    if (!organizationId) {
      const client = await clerkClient()
      const orgMemberships = await client.users.getOrganizationMembershipList({ userId })
      if (orgMemberships.data && orgMemberships.data.length > 0) {
        organizationId = orgMemberships.data[0].organization.id
      }
    }

    // User must have an organization to view servers
    if (!organizationId) {
      return NextResponse.json({ servers: [] })
    }

    // Fetch servers ONLY for this specific organization
    const servers = await prisma.server.findMany({
      where: {
        organizationId: organizationId
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ servers })
  } catch (error) {
    console.error("Error fetching servers:", error)
    return NextResponse.json({ error: "Failed to fetch servers" }, { status: 500 })
  }
}

