import { type NextRequest, NextResponse } from "next/server"
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

    const { quantity, pricePerServer, totalPrice, inboxRange, sendingVolume, couponCode } = await request.json()

    // Enforce 1 server limit per checkout
    if (quantity > 1) {
      return NextResponse.json({ 
        error: "You can only order 1 server at a time. Please complete your order for 1 server first, then place another order if you need additional servers." 
      }, { status: 400 })
    }

    // Find or create a Stripe customer for this user
    let customerId: string
    
    // First, try to find an existing customer
    const existingCustomers = await stripe.customers.list({
      limit: 100,
    })
    
    const existingCustomer = existingCustomers.data.find(c => 
      c.metadata.clerkUserId === userId
    )
    
    if (existingCustomer) {
      customerId = existingCustomer.id
    } else {
      // Create a new customer
      const customer = await stripe.customers.create({
        metadata: {
          clerkUserId: userId,
        },
      })
      customerId = customer.id
    }

    const origin = request.headers.get("origin")
    const baseUrl = origin || `https://${request.headers.get("host")}`

    // Ensure the URL has a proper scheme
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
            unit_amount: pricePerServer * 100, // Stripe expects cents
            recurring: {
              interval: "month",
            },
          },
          quantity: quantity,
        },
      ],
      mode: "subscription",
      success_url: `${normalizedBaseUrl}/dashboard?success=true`,
      cancel_url: `${normalizedBaseUrl}/checkout?canceled=true`,
      metadata: {
        quantity: quantity.toString(),
        inboxRange,
        sendingVolume: sendingVolume.toString(),
        clerkUserId: userId,
      },
    }

    if (couponCode) {
      // Find the promotion code to get the coupon ID
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

    const session = await stripe.checkout.sessions.create(sessionConfig)

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("Error creating checkout session:", error)
    return NextResponse.json({ error: "Error creating checkout session" }, { status: 500 })
  }
}
