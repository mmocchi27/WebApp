import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
})

export async function GET(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's organization (either from auth or fetch first org)
    let organizationId = orgId
    
    if (!organizationId) {
      const client = await clerkClient()
      const orgMemberships = await client.users.getOrganizationMembershipList({ userId })
      if (orgMemberships.data && orgMemberships.data.length > 0) {
        organizationId = orgMemberships.data[0].organization.id
      }
    }

    // User must have an organization to view subscriptions
    if (!organizationId) {
      return NextResponse.json({
        subscriptions: [],
      })
    }

    // Get all subscription IDs for this organization from the database
    // This ensures we only show subscriptions that belong to THIS org
    const { prisma } = await import("@/lib/prisma")
    const orgServers = await prisma.server.findMany({
      where: {
        organizationId: organizationId,
      },
      select: {
        subscriptionId: true,
      },
    })

    const orgSubscriptionIds = new Set(orgServers.map(s => s.subscriptionId))

    // If no subscriptions for this org, return empty
    if (orgSubscriptionIds.size === 0) {
      return NextResponse.json({
        subscriptions: [],
      })
    }

    // Get ALL subscriptions from Stripe that match our org's subscription IDs
    const allSubscriptions: Stripe.Subscription[] = []
    for (const subId of orgSubscriptionIds) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subId, {
          expand: ['default_payment_method', 'latest_invoice'],
        })
        allSubscriptions.push(subscription)
      } catch (error) {
        console.error(`Failed to retrieve subscription ${subId}:`, error)
      }
    }

    // Filter subscriptions to only show active ones
    const activeSubscriptions = allSubscriptions.filter(sub => 
      sub.status === 'active' || sub.status === 'past_due'
    )

    const formattedSubscriptions = activeSubscriptions.map((sub) => {
      // Generate order number from subscription ID
      const orderNumber = sub.id.substring(4, 12).toUpperCase()

      // Calculate the next billing date based on created date and billing cycle
      const createdDate = (sub as any).created ? new Date((sub as any).created * 1000) : null
      const nextBillingDate = createdDate ? new Date(createdDate.getTime() + (30 * 24 * 60 * 60 * 1000)) : null

      return {
        id: sub.id,
        status: sub.status,
        current_period_end: (sub as any).current_period_end || (nextBillingDate ? Math.floor(nextBillingDate.getTime() / 1000) : 0),
        orderNumber,
        serverName: sub.metadata.serverName || null,
        domainList: sub.metadata.domainList || null,
        ipAddress: sub.metadata.ipAddress || null,
      }
    })

    return NextResponse.json({
      subscriptions: formattedSubscriptions,
    })
  } catch (error) {
    console.error("Error fetching subscriptions:", error)
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 })
  }
}
