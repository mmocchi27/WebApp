import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
})

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { subscriptionId, metadata } = await request.json()

    if (!subscriptionId || !metadata) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // First, verify that this subscription belongs to the authenticated user
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    
    // Get the customer for this subscription
    const customer = await stripe.customers.retrieve(subscription.customer as string)
    
    // Check if the customer belongs to the authenticated user
    if (customer.metadata.clerkUserId !== userId) {
      return NextResponse.json({ error: "Unauthorized - You can only update your own subscriptions" }, { status: 403 })
    }

    // Update the Stripe subscription with the new metadata
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      metadata: metadata
    })

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
