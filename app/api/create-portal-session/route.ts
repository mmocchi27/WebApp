import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
})

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the return URL from the request body
    const { returnUrl } = await req.json()

    // Search for customer by organization ID first, then user ID
    const searchQueries = []
    if (orgId) {
      searchQueries.push(`metadata['clerkOrgId']:'${orgId}'`)
    }
    searchQueries.push(`metadata['clerkUserId']:'${userId}'`)

    let customer = null
    for (const query of searchQueries) {
      const customers = await stripe.customers.search({ query })
      if (customers.data.length > 0) {
        customer = customers.data[0]
        break
      }
    }

    if (!customer) {
      return NextResponse.json(
        { error: 'No billing information found. Please create a subscription first.' },
        { status: 404 }
      )
    }

    // Create a portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl || `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Error creating portal session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create portal session' },
      { status: 500 }
    )
  }
}

