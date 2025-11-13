import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headersList = await headers()
    const signature = headersList.get("stripe-signature")

    if (!signature) {
      return NextResponse.json({ error: "No signature" }, { status: 400 })
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error("Webhook signature verification failed:", err)
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    console.log("Webhook event received:", event.type)

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break
      
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break
      
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Webhook error" }, { status: 500 })
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log("Checkout session completed:", session.id)
  
  // The customer and subscription should already be linked from the checkout session
  // This is just for logging and any additional processing
  if (session.customer && session.subscription) {
    console.log(`Customer ${session.customer} created subscription ${session.subscription}`)
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log("Subscription created:", subscription.id)
  
  // Ensure the subscription metadata includes the Clerk user ID or Org ID
  const clerkOrgId = subscription.metadata.clerkOrgId
  const clerkUserId = subscription.metadata.clerkUserId
  
  if (clerkOrgId || clerkUserId) {
    console.log(`Subscription ${subscription.id} linked to Clerk org ${clerkOrgId} or user ${clerkUserId}`)
    
    // Create a server record in the database
    try {
      const organizationId = clerkOrgId || clerkUserId // Use org ID first, fall back to user ID
      
      await prisma.server.create({
        data: {
          subscriptionId: subscription.id,
          organizationId: organizationId,
          status: 'pending', // Will be updated to 'active' when admin assigns IP
          ipAddress: null,
          apiKey: null
        }
      })
      
      console.log(`Server record created for subscription ${subscription.id}`)
    } catch (error) {
      console.error('Error creating server record:', error)
    }
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("Subscription updated:", subscription.id)
  
  // Handle any subscription updates if needed
  // For example, updating server status, sending notifications, etc.
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("Subscription deleted:", subscription.id)
  
  // Handle subscription cancellation
  // For example, deactivating servers, sending cancellation emails, etc.
}
