import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
})

/**
 * Migration API: Migrates a user's existing subscriptions to their organization.
 * This is for users who signed up before org structure was implemented.
 */
export async function POST(request: NextRequest) {
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

    if (!organizationId) {
      return NextResponse.json({ 
        error: "No organization found. Please create or join an organization first." 
      }, { status: 400 })
    }

    // Find all Stripe customers with this user's ID
    const existingCustomers = await stripe.customers.list({
      limit: 100,
    })
    
    const userCustomers = existingCustomers.data.filter(c => 
      c.metadata.clerkUserId === userId && !c.metadata.clerkOrgId
    )

    if (userCustomers.length === 0) {
      return NextResponse.json({ 
        message: "No subscriptions to migrate. All subscriptions are already org-based.",
        migratedCount: 0
      })
    }

    // Update each customer to include the org ID
    let migratedCount = 0
    for (const customer of userCustomers) {
      await stripe.customers.update(customer.id, {
        metadata: {
          clerkUserId: userId, // Keep for backwards compatibility
          clerkOrgId: organizationId, // Add org ID
        },
      })
      migratedCount++
    }

    console.log(`Migrated ${migratedCount} Stripe customers to org ${organizationId} for user ${userId}`)

    return NextResponse.json({ 
      success: true,
      message: `Successfully migrated ${migratedCount} subscription(s) to your organization.`,
      migratedCount,
      organizationId
    })
  } catch (error: any) {
    console.error("Error migrating subscriptions to org:", error)
    return NextResponse.json({ 
      error: error.message || "Failed to migrate subscriptions" 
    }, { status: 500 })
  }
}

