import { type NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-07-30.basil",
  })
}

export async function POST(request: NextRequest) {
  console.log("[checkout] Handler called")
  try {
    const stripe = getStripe()
    console.log("[checkout] Stripe client created")
    
    const { userId, orgId } = await auth()
    console.log("[checkout] Auth complete:", { userId: !!userId, orgId: !!orgId })
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let organizationId = orgId
    
    if (!organizationId) {
      const client = await clerkClient()
      const orgMemberships = await client.users.getOrganizationMembershipList({ userId })
      if (orgMemberships.data && orgMemberships.data.length > 0) {
        organizationId = orgMemberships.data[0].organization.id
      }
    }

    if (!organizationId) {
      return NextResponse.json({ 
        error: "You must be part of an organization to create a subscription. Please refresh the page." 
      }, { status: 400 })
    }

    const { quantity, serverName, pricePerServer, totalPrice, inboxRange, sendingVolume, couponCode } = await request.json()

    if (!serverName || !serverName.trim()) {
      return NextResponse.json({ 
        error: "Server name is required." 
      }, { status: 400 })
    }

    const normalizedServerName = serverName.trim()

    if (quantity > 1) {
      return NextResponse.json({ 
        error: "You can only order 1 server at a time. Please complete your order for 1 server first, then place another order if you need additional servers." 
      }, { status: 400 })
    }

    console.log("[checkout] Finding/creating customer for org:", organizationId)

    let customerId: string
    
    const existingCustomers = await stripe.customers.list({
      limit: 100,
    })
    
    let existingCustomer = existingCustomers.data.find(c => 
      c.metadata.clerkOrgId === organizationId
    )
    
    if (!existingCustomer) {
      existingCustomer = existingCustomers.data.find(c => 
        c.metadata.clerkUserId === userId
      )
      
      if (existingCustomer) {
        await stripe.customers.update(existingCustomer.id, {
          metadata: {
            clerkUserId: userId,
            clerkOrgId: organizationId,
          },
        })
        customerId = existingCustomer.id
      }
    }
    
    if (existingCustomer) {
      customerId = existingCustomer.id
    } else {
      const customer = await stripe.customers.create({
        metadata: {
          clerkUserId: userId,
          clerkOrgId: organizationId,
        },
      })
      customerId = customer.id
    }

    console.log("[checkout] Customer ID:", customerId)

    const origin = request.headers.get("origin")
    const baseUrl = origin || `https://${request.headers.get("host")}`
    const normalizedBaseUrl = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`

    const sessionConfig: any = {
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `MailMountains Server${quantity > 1 ? "s" : ""}`,
              description: `${inboxRange} inboxes, ${sendingVolume}k emails/month`,
            },
            unit_amount: pricePerServer * 100,
            recurring: {
              interval: "month",
            },
          },
          quantity: quantity,
        },
      ],
      mode: "subscription",
      success_url: `${normalizedBaseUrl}/servers?success=true`,
      cancel_url: `${normalizedBaseUrl}/checkout?canceled=true`,
      metadata: {
        quantity: quantity.toString(),
        serverName: normalizedServerName,
        inboxRange,
        sendingVolume: sendingVolume.toString(),
        clerkUserId: userId,
        clerkOrgId: organizationId,
      },
      subscription_data: {
        metadata: {
          serverName: normalizedServerName,
          clerkUserId: userId,
          clerkOrgId: organizationId,
        },
        description: normalizedServerName,
      },
    }

    if (couponCode) {
      const promotionCodes = await stripe.promotionCodes.list({
        code: couponCode,
        active: true,
        limit: 1,
      })

      if (promotionCodes.data.length > 0) {
        sessionConfig.discounts = [
          {
            promotion_code: promotionCodes.data[0].id,
          },
        ]
      }
    }

    console.log("[checkout] Creating session...")
    const session = await stripe.checkout.sessions.create(sessionConfig)

    console.log("[checkout] Session created:", session.id)
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("[checkout] Error:", error)
    return NextResponse.json({ error: "Error creating checkout session" }, { status: 500 })
  }
}
