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

    // Fetch servers for BOTH org ID (if exists) AND user ID
    // This handles both new servers (with org ID) and legacy servers (with user ID)
    const whereConditions = []
    
    if (organizationId) {
      whereConditions.push({ organizationId: organizationId })
    }
    whereConditions.push({ organizationId: userId })

    const servers = await prisma.server.findMany({
      where: {
        OR: whereConditions
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

