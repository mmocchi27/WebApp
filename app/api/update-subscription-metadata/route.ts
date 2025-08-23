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

    // Update the Stripe subscription with the new metadata
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      metadata: metadata
    })

    return NextResponse.json({ 
      success: true, 
      subscription: {
        id: subscription.id,
        metadata: subscription.metadata
      }
    })

  } catch (error) {
    console.error("Error updating subscription metadata:", error)
    return NextResponse.json({ error: "Failed to update subscription metadata" }, { status: 500 })
  }
}
