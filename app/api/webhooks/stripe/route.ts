import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { cleanupSubscriptionResources } from "@/lib/serverCleanup"

// #region agent log
console.log('[DEBUG-MODULE] stripe-webhook module loaded, STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY, ', STRIPE_WEBHOOK_SECRET exists:', !!process.env.STRIPE_WEBHOOK_SECRET)
// #endregion

// Make this route publicly accessible (no auth required)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Module-level stripe instance for helper functions
let _stripe: Stripe | null = null
function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-07-30.basil",
    })
  }
  return _stripe
}

export async function POST(request: NextRequest) {
  // #region agent log
  console.log('[DEBUG-HANDLER] POST handler called for stripe-webhook')
  // #endregion
  
  try {
    // #region agent log
    console.log('[DEBUG-HANDLER] Getting Stripe client and webhook secret')
    // #endregion
    const stripe = getStripe()
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
    const body = await request.text()
    console.log("🔥 BODY READ COMPLETE")
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
  const stripe = getStripe()
  
  try {
    // Get the customer to find Clerk IDs (stored in customer metadata, not subscription)
    const customer = await stripe.customers.retrieve(subscription.customer as string)
    
    // Check if customer is deleted
    if ('deleted' in customer && customer.deleted) {
      console.error(`❌ Customer ${subscription.customer} is deleted, cannot create server`)
      return
    }
    
    console.log(`[WEBHOOK-DEBUG] Customer metadata:`, JSON.stringify(customer.metadata))
    console.log(`[WEBHOOK-DEBUG] Subscription metadata:`, JSON.stringify(subscription.metadata))
    
    const clerkOrgId = customer.metadata?.clerkOrgId
    const clerkUserId = customer.metadata?.clerkUserId

    // Fetch the originating checkout session (for extra metadata)
    const sessions = await stripe.checkout.sessions.list({
      subscription: subscription.id,
      limit: 1,
    })
    const checkoutSession = sessions.data[0]

    let organizationId = clerkOrgId || clerkUserId || null
    console.log(`[WEBHOOK-DEBUG] Initial organizationId from customer: ${organizationId}`)
    
    if (!organizationId) {
      console.log(`[WEBHOOK-DEBUG] Checkout session metadata:`, JSON.stringify(checkoutSession?.metadata))
      organizationId =
        checkoutSession?.metadata?.clerkOrgId ||
        checkoutSession?.metadata?.clerkUserId ||
        null
      console.log(`[WEBHOOK-DEBUG] organizationId from checkout session: ${organizationId}`)
    }

    if (!organizationId) {
      console.error(
        `❌ No Clerk org/user ID found for subscription ${subscription.id}; skipping server creation. Customer: ${subscription.customer}`
      )
      return
    }
    
    console.log(`Subscription ${subscription.id} linked to Clerk ${organizationId}`)
    
    let serverName = subscription.metadata?.serverName?.trim() || null

    if (!serverName) {
      serverName = checkoutSession?.metadata?.serverName?.trim() || null
    }

    console.log(`Server name from checkout: ${serverName}`)

    if (serverName && !subscription.metadata?.serverName) {
      try {
        await stripe.subscriptions.update(subscription.id, {
          metadata: {
            ...(subscription.metadata || {}),
            serverName,
          },
          description: serverName,
        })
        console.log(`✅ Synced server name to Stripe metadata for subscription ${subscription.id}`)
      } catch (err) {
        console.error(
          `❌ Failed to sync server name to Stripe metadata for subscription ${subscription.id}:`,
          err
        )
      }
    }

    // Create a server record in the database
    console.log(`[WEBHOOK-DEBUG] Creating server with:`, {
      subscriptionId: subscription.id,
      organizationId,
      serverName
    })
    
    const newServer = await prisma.server.create({
      data: {
        subscriptionId: subscription.id,
        organizationId: organizationId,
        serverName: serverName,
        status: 'pending', // Will be updated to 'active' when admin assigns IP
        ipAddress: null,
        apiKey: null
      }
    })
    
    console.log(`✅ Server record created for subscription ${subscription.id} with ID: ${newServer.id}, name: ${serverName}`)
  } catch (error: any) {
    console.error('❌ Error creating server record:', error?.message || error)
    console.error('❌ Full error:', JSON.stringify(error, null, 2))
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("Subscription updated:", subscription.id)
  
  try {
    const status = subscription.status
    const cancelAtPeriodEnd = subscription.cancel_at_period_end

    // Handle unpaid status separately - mark as unpaid (recoverable) not cancelled
    if (status === "unpaid") {
      console.log(`Subscription ${subscription.id} is unpaid – marking server as unpaid`)

      const result = await prisma.server.updateMany({
        where: { subscriptionId: subscription.id },
        data: {
          status: "unpaid",
          updatedAt: new Date(),
        },
      })

      if (result.count > 0) {
        console.log(`✅ Server status updated to 'unpaid' for subscription ${subscription.id}`)
      } else {
        console.log(`⚠️  No server found for subscription ${subscription.id}`)
      }
    }

    // Handle terminal cancellation states
    if (cancelAtPeriodEnd || status === "canceled" || status === "incomplete_expired") {
      console.log(`Subscription ${subscription.id} is ${status} (cancel_at_period_end=${cancelAtPeriodEnd}) – updating server status`)

      const result = await prisma.server.updateMany({
        where: { subscriptionId: subscription.id },
        data: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      })

      if (result.count > 0) {
        console.log(`✅ Server status updated to 'cancelled' for subscription ${subscription.id}`)
      } else {
        console.log(`⚠️  No server found for subscription ${subscription.id}`)
      }
    }

    if (status === "canceled") {
      console.log(`Subscription ${subscription.id} is now canceled - cleaning up resources`)
      await cleanupSubscriptionResources(subscription.id)
    }
  } catch (error) {
    console.error('❌ Error handling subscription update:', error)
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("Subscription deleted:", subscription.id)
  
  try {
    await cleanupSubscriptionResources(subscription.id)
  } catch (error) {
    console.error('❌ Error updating server status on cancellation:', error)
  }
}

