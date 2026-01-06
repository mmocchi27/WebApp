import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-07-30.basil",
  })
}

export async function POST(request: NextRequest) {
  // #region agent log
  console.log(`[DEBUG-C] Handler entry: hasStripeKey=${!!process.env.STRIPE_SECRET_KEY}, hasClerkKey=${!!process.env.CLERK_SECRET_KEY}`)
  // #endregion

  console.log("[coupon] Handler called")
  try {
    const stripe = getStripe()
    console.log("[coupon] Stripe client created")

    // #region agent log
    console.log('[DEBUG-B] Before auth()')
    // #endregion
    
    const { userId } = await auth()

    // #region agent log
    console.log(`[DEBUG-B] After auth(): hasUserId=${!!userId}`)
    // #endregion

    console.log("[coupon] Auth complete:", !!userId)
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { couponCode, amount } = await request.json()
    const normalizedCouponCode = couponCode.toUpperCase()

    console.log("[coupon] Validating:", normalizedCouponCode)

    const promotionCodes = await stripe.promotionCodes.list({
      code: normalizedCouponCode,
      limit: 1,
    })

    console.log("[coupon] Found:", promotionCodes.data.length)

    if (promotionCodes.data.length === 0) {
      return NextResponse.json({
        valid: false,
        error: "Invalid or expired coupon code",
      })
    }

    const promotionCode = promotionCodes.data[0]
    const coupon = promotionCode.coupon

    if (!promotionCode.active) {
      return NextResponse.json({
        valid: false,
        error: "Promotion code is not active",
      })
    }

    if (!coupon.valid) {
      return NextResponse.json({
        valid: false,
        error: "Coupon is no longer valid",
      })
    }

    if (coupon.redeem_by && coupon.redeem_by < Math.floor(Date.now() / 1000)) {
      return NextResponse.json({
        valid: false,
        error: "Coupon has expired",
      })
    }

    if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) {
      return NextResponse.json({
        valid: false,
        error: "Coupon usage limit reached",
      })
    }

    // #region agent log
    console.log(`[DEBUG-B] Handler success: couponId=${coupon.id}`)
    // #endregion

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off,
        currency: coupon.currency,
        name: coupon.name,
      },
    })
  } catch (error: any) {
    // #region agent log
    console.log(`[DEBUG-B] Handler error: ${error?.message||String(error)}`)
    // #endregion
    console.error("[coupon] Error:", error)
    return NextResponse.json({
      valid: false,
      error: "Error validating coupon code",
    })
  }
}
