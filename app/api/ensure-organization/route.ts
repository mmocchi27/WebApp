import { NextResponse } from "next/server"
import { ensureUserHasOrganization } from "@/lib/ensure-organization"

export async function POST() {
  try {
    const orgId = await ensureUserHasOrganization()
    
    if (!orgId) {
      return NextResponse.json(
        { error: "Failed to ensure organization" },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      organizationId: orgId 
    })
  } catch (error) {
    console.error("Error in ensure-organization API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

