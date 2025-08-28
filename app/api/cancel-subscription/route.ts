import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
})

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { subscriptionId } = await request.json()

    if (!subscriptionId) {
      return NextResponse.json({ error: "Subscription ID is required" }, { status: 400 })
    }

    // First, verify that this subscription belongs to the authenticated user
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    
    // Get the customer for this subscription
    const customer = await stripe.customers.retrieve(subscription.customer as string)
    
    // Check if the customer belongs to the authenticated user
    if (customer.metadata.clerkUserId !== userId) {
      return NextResponse.json({ error: "Unauthorized - You can only cancel your own subscriptions" }, { status: 403 })
    }

    console.log("[v0] Canceling subscription:", subscriptionId)

    const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId)

    console.log("[v0] Subscription canceled:", canceledSubscription.id)

    return NextResponse.json({
      success: true,
      subscription: {
        id: canceledSubscription.id,
        status: canceledSubscription.status,
        canceled_at: canceledSubscription.canceled_at,
      },
    })
  } catch (error: any) {
    console.error("[v0] Error canceling subscription:", error)
    return NextResponse.json({ error: error.message || "Failed to cancel subscription" }, { status: 500 })
  }
}
