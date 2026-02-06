import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { cleanupSubscriptionResources } from "@/lib/serverCleanup"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Make this route publicly accessible (no auth required)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    console.log("📥 Webhook event received:", event.type, "| Event ID:", event.id)

    try {
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
          console.log(`⚠️  Unhandled event type: ${event.type}`)
      }

      console.log(`✅ Successfully processed webhook event ${event.id} (${event.type})`)
      return NextResponse.json({ received: true })
    } catch (handlerError: any) {
      console.error(`❌ Handler error for event ${event.id} (${event.type}):`)
      console.error("   Error message:", handlerError?.message)
      console.error("   Error stack:", handlerError?.stack)
      // Return 500 so Stripe knows to retry
      return NextResponse.json(
        { 
          error: "Webhook handler failed", 
          eventType: event.type,
          eventId: event.id,
          message: handlerError?.message 
        }, 
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Webhook error" }, { status: 500 })
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log("💳 Checkout session completed:", session.id)
  console.log("   Customer:", session.customer)
  console.log("   Subscription:", session.subscription)
  console.log("   Metadata:", JSON.stringify(session.metadata, null, 2))
  
  // The customer and subscription should already be linked from the checkout session
  // This is just for logging and any additional processing
  if (session.customer && session.subscription) {
    console.log(`✅ Customer ${session.customer} created subscription ${session.subscription}`)
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log("📦 Subscription created:", subscription.id)
  console.log("   Customer ID:", subscription.customer)
  console.log("   Subscription metadata:", JSON.stringify(subscription.metadata, null, 2))
  
  try {
    // Get the customer to find Clerk IDs (stored in customer metadata, not subscription)
    const customer = await stripe.customers.retrieve(subscription.customer as string)
    console.log("   Customer metadata:", JSON.stringify(customer.metadata, null, 2))
    
    const clerkOrgId = customer.metadata.clerkOrgId
    const clerkUserId = customer.metadata.clerkUserId

    // Fetch the originating checkout session (for extra metadata)
    const sessions = await stripe.checkout.sessions.list({
      subscription: subscription.id,
      limit: 1,
    })
    const checkoutSession = sessions.data[0]
    console.log("   Checkout session metadata:", checkoutSession ? JSON.stringify(checkoutSession.metadata, null, 2) : "No checkout session found")

    let organizationId = clerkOrgId || clerkUserId || null
    if (!organizationId) {
      organizationId =
        checkoutSession?.metadata?.clerkOrgId ||
        checkoutSession?.metadata?.clerkUserId ||
        null
    }

    if (!organizationId) {
      const errorMsg = `❌ CRITICAL: No Clerk org/user ID found for subscription ${subscription.id}. Customer ID: ${subscription.customer}. This will prevent server creation.`
      console.error(errorMsg)
      console.error("   Customer metadata keys:", Object.keys(customer.metadata))
      console.error("   Checkout session metadata keys:", checkoutSession ? Object.keys(checkoutSession.metadata) : "N/A")
      // Re-throw so Stripe knows the webhook failed and can retry
      throw new Error(errorMsg)
    }
    
    console.log(`✅ Subscription ${subscription.id} linked to Clerk ${organizationId}`)
    
    let serverName = subscription.metadata?.serverName?.trim() || null

    if (!serverName) {
      serverName = checkoutSession?.metadata?.serverName?.trim() || null
    }

    console.log(`   Server name from checkout: ${serverName || 'NOT PROVIDED'}`)

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
          `⚠️  Failed to sync server name to Stripe metadata for subscription ${subscription.id}:`,
          err
        )
        // Don't throw here - server name sync failure shouldn't block server creation
      }
    }

    // Check if server already exists (prevent duplicates)
    const existingServer = await prisma.server.findFirst({
      where: { subscriptionId: subscription.id }
    })

    if (existingServer) {
      console.log(`⚠️  Server already exists for subscription ${subscription.id} (ID: ${existingServer.id}). Skipping creation.`)
      return
    }

    // Create a server record in the database
    console.log(`   Creating server record in database...`)
    const server = await prisma.server.create({
      data: {
        subscriptionId: subscription.id,
        organizationId: organizationId,
        serverName: serverName,
        status: 'pending', // Will be updated to 'active' when admin assigns IP
        ipAddress: null,
        apiKey: null
      }
    })
    
    console.log(`✅ Server record created successfully!`)
    console.log(`   Server ID: ${server.id}`)
    console.log(`   Subscription ID: ${server.subscriptionId}`)
    console.log(`   Organization ID: ${server.organizationId}`)
    console.log(`   Server Name: ${server.serverName}`)
    console.log(`   Status: ${server.status}`)
  } catch (error: any) {
    console.error('❌ CRITICAL ERROR creating server record:')
    console.error('   Subscription ID:', subscription.id)
    console.error('   Error message:', error?.message)
    console.error('   Error stack:', error?.stack)
    console.error('   Full error:', JSON.stringify(error, null, 2))
    // Re-throw so Stripe knows the webhook failed and can retry
    throw error
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("Subscription updated:", subscription.id)
  
  try {
    const status = subscription.status
    const cancelAtPeriodEnd = subscription.cancel_at_period_end

    if (cancelAtPeriodEnd || status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
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

