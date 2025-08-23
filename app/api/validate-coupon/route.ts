import { type NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
})

export async function POST(request: NextRequest) {
  try {
    const { couponCode, amount } = await request.json()

    const normalizedCouponCode = couponCode.toUpperCase()

    console.log("[v0] Validating coupon code:", normalizedCouponCode)

    const promotionCodes = await stripe.promotionCodes.list({
      code: normalizedCouponCode,
      limit: 1,
    })

    console.log("[v0] Found promotion codes:", promotionCodes.data.length)

    if (promotionCodes.data.length === 0) {
      console.log("[v0] No promotion codes found for:", normalizedCouponCode)
      return NextResponse.json({
        valid: false,
        error: "Invalid or expired coupon code",
      })
    }

    const promotionCode = promotionCodes.data[0]
    const coupon = promotionCode.coupon

    console.log("[v0] Promotion code active:", promotionCode.active)
    console.log("[v0] Coupon valid:", coupon.valid)
    console.log("[v0] Coupon details:", {
      id: coupon.id,
      percent_off: coupon.percent_off,
      amount_off: coupon.amount_off,
      times_redeemed: coupon.times_redeemed,
      max_redemptions: coupon.max_redemptions,
      redeem_by: coupon.redeem_by,
    })

    if (!promotionCode.active) {
      return NextResponse.json({
        valid: false,
        error: "Promotion code is not active",
      })
    }

    // Check if coupon is still valid
    if (!coupon.valid) {
      return NextResponse.json({
        valid: false,
        error: "Coupon is no longer valid",
      })
    }

    // Check expiration
    if (coupon.redeem_by && coupon.redeem_by < Math.floor(Date.now() / 1000)) {
      return NextResponse.json({
        valid: false,
        error: "Coupon has expired",
      })
    }

    // Check usage limits
    if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) {
      return NextResponse.json({
        valid: false,
        error: "Coupon usage limit reached",
      })
    }

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
  } catch (error) {
    console.error("[v0] Stripe API error validating coupon:", error)
    return NextResponse.json({
      valid: false,
      error: "Error validating coupon code",
    })
  }
}
