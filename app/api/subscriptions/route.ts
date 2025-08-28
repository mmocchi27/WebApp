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

    // First, find the Stripe customer for this Clerk user
    let customerId: string | null = null
    
    // Search for existing customers with this Clerk user ID in metadata
    const existingCustomers = await stripe.customers.list({
      limit: 100,
    })
    
    const customer = existingCustomers.data.find(c => 
      c.metadata.clerkUserId === userId
    )
    
    if (customer) {
      customerId = customer.id
    }

    // If no customer exists, return empty subscriptions
    if (!customerId) {
      return NextResponse.json({
        subscriptions: [],
      })
    }

    // Get subscriptions for this specific customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 100,
      expand: ['data.default_payment_method', 'data.latest_invoice'],
    })

    // Filter subscriptions to only show active ones
    const activeSubscriptions = subscriptions.data.filter(sub => 
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
