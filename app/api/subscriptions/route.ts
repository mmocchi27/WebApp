import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
})

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // For now, let's get all subscriptions and filter by metadata or handle the case
    // where we don't have a customer ID yet. This is a temporary solution.
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      expand: ['data.default_payment_method', 'data.latest_invoice'],
    })

    // Filter subscriptions to only show active ones for now
    // In a production app, you'd want to properly link Clerk users to Stripe customers
    const activeSubscriptions = subscriptions.data.filter(sub => 
      sub.status === 'active' || sub.status === 'past_due'
    )

    const formattedSubscriptions = activeSubscriptions.map((sub) => {
      // Generate order number from subscription ID
      const orderNumber = sub.id.substring(4, 12).toUpperCase()

      // Log the subscription object to see what fields are available
      console.log('Subscription object:', {
        id: sub.id,
        status: sub.status,
        current_period_start: (sub as any).current_period_start,
        current_period_end: (sub as any).current_period_end,
        created: (sub as any).created,
        metadata: sub.metadata,
        // Try to access the billing cycle info
        billing_cycle_anchor: (sub as any).billing_cycle_anchor,
        trial_end: (sub as any).trial_end,
        // Get the items to see pricing info
        items: (sub as any).items?.data
      })

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
