import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-11-20.acacia',
  })
}

export async function POST(req: NextRequest) {
  // #region agent log
  console.log(`[DEBUG-C] Handler entry: hasStripeKey=${!!process.env.STRIPE_SECRET_KEY}, hasClerkKey=${!!process.env.CLERK_SECRET_KEY}`)
  // #endregion
  
  console.log('[portal] Handler called')
  try {
    const stripe = getStripe()
    console.log('[portal] Stripe client created')

    // #region agent log
    console.log('[DEBUG-B] Before auth()')
    // #endregion
    
    const { userId, orgId } = await auth()

    // #region agent log
    console.log(`[DEBUG-B] After auth(): hasUserId=${!!userId}, hasOrgId=${!!orgId}`)
    // #endregion
    
    console.log('[portal] Auth complete:', { userId: !!userId, orgId: !!orgId })
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { returnUrl } = await req.json()

    const searchQueries = []
    if (orgId) {
      searchQueries.push(`metadata['clerkOrgId']:'${orgId}'`)
    }
    searchQueries.push(`metadata['clerkUserId']:'${userId}'`)

    let customer = null
    for (const query of searchQueries) {
      console.log('[portal] Searching customers with query:', query)
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

    console.log('[portal] Creating portal session for customer:', customer.id)
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl || `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    })

    // #region agent log
    console.log(`[DEBUG-B] Handler success: sessionId=${session.id}`)
    // #endregion

    console.log('[portal] Session created:', session.id)
    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    // #region agent log
    console.log(`[DEBUG-B] Handler error: ${error?.message||String(error)}`)
    // #endregion
    console.error('[portal] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
