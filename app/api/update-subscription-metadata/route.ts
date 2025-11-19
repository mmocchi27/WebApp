import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import Stripe from "stripe"
import { prisma } from "@/lib/prisma"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
})

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

    const { subscriptionId, metadata } = await request.json()

    if (!subscriptionId || !metadata) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // First, verify that this subscription belongs to the authenticated user/org
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    
    // Get the customer for this subscription
    const customer = await stripe.customers.retrieve(subscription.customer as string)
    
    // Check if the customer belongs to the authenticated user's organization (or user for legacy)
    const belongsToOrg = organizationId && customer.metadata.clerkOrgId === organizationId
    const belongsToUser = customer.metadata.clerkUserId === userId
    
    if (!belongsToOrg && !belongsToUser) {
      return NextResponse.json({ error: "Unauthorized - You can only update your own subscriptions" }, { status: 403 })
    }

    // Update the Stripe subscription with the new metadata and description
    const updateData: any = {
      metadata: metadata
    }
    
    // If serverName is provided, also update the subscription description
    // This will show up in the billing portal and invoices
    if (metadata.serverName) {
      updateData.description = metadata.serverName
    }
    
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, updateData)

    // Also update the database if serverName is provided
    if (metadata.serverName) {
      try {
        await prisma.server.updateMany({
          where: { subscriptionId },
          data: { 
            serverName: metadata.serverName,
            updatedAt: new Date()
          }
        })
      } catch (dbError) {
        console.error("Error updating database:", dbError)
        // Continue even if DB update fails - Stripe is source of truth for metadata
      }
    }

    return NextResponse.json({ 
      success: true, 
      subscription: {
        id: updatedSubscription.id,
        metadata: updatedSubscription.metadata
      }
    })

  } catch (error) {
    console.error("Error updating subscription metadata:", error)
    return NextResponse.json({ error: "Failed to update subscription metadata" }, { status: 500 })
  }
}
