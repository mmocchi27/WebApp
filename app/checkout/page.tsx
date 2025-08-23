"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function CheckoutPage() {
  const router = useRouter()
  const [quantity, setQuantity] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [couponCode, setCouponCode] = useState("")
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null)
  const [couponError, setCouponError] = useState("")
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false)
  const [checkoutError, setCheckoutError] = useState("")

  const validateCoupon = async () => {
    if (!couponCode.trim()) return

    setIsValidatingCoupon(true)
    setCouponError("")

    try {
      const response = await fetch("/api/validate-coupon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          couponCode: couponCode.trim(),
          amount: calculatePrice() * 100, // Convert to cents
        }),
      })

      const data = await response.json()

      if (data.valid) {
        setAppliedCoupon(data.coupon)
        setCouponError("")
      } else {
        setCouponError(data.error || "Invalid coupon code")
        setAppliedCoupon(null)
      }
    } catch (error) {
      setCouponError("Error validating coupon code")
      setAppliedCoupon(null)
    } finally {
      setIsValidatingCoupon(false)
    }
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponCode("")
    setCouponError("")
  }

  const handlePurchase = async () => {
    setIsLoading(true)
    setCheckoutError("")

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantity: quantity,
          pricePerServer: 200,
          totalPrice: calculateFinalPrice(),
          inboxRange: getInboxRange(),
          sendingVolume: calculateSendingVolume(),
          couponCode: appliedCoupon ? couponCode.trim() : null,
        }),
      })

      const data = await response.json()

      if (response.ok && data.url) {
        window.location.href = data.url
      } else {
        // Handle error response from API
        setCheckoutError(data.error || "There was an error processing your request. Please try again.")
      }
    } catch (error) {
      console.error("Error creating checkout session:", error)
      setCheckoutError("There was an error processing your request. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogoClick = () => {
    router.push("/")
  }

  const handleBackToDashboard = () => {
    router.push("/dashboard")
  }

  const calculateInboxes = () => quantity * 102
  const calculateSendingVolume = () => quantity * 100
  const calculatePrice = () => quantity * 200

  const calculateFinalPrice = () => {
    const basePrice = calculatePrice()
    if (!appliedCoupon) return basePrice

    if (appliedCoupon.percent_off) {
      return basePrice * (1 - appliedCoupon.percent_off / 100)
    } else if (appliedCoupon.amount_off) {
      return Math.max(0, basePrice - appliedCoupon.amount_off / 100)
    }
    return basePrice
  }

  const getDiscountAmount = () => {
    if (!appliedCoupon) return 0
    return calculatePrice() - calculateFinalPrice()
  }

  const getInboxRange = () => {
    const startRange = (quantity - 1) * 102 + 1
    const endRange = quantity * 102
    return `${startRange} - ${endRange}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleLogoClick}
          >
            <svg width="32" height="24" viewBox="0 0 32 24" className="flex-shrink-0">
              <path d="M0 24L8 8L16 16L24 4L32 20V24H0Z" fill="#2563eb" opacity="0.8" />
              <path d="M4 24L12 12L20 18L28 8L32 16V24H4Z" fill="#1d4ed8" />
              <rect x="12" y="10" width="8" height="6" rx="1" fill="white" stroke="#1d4ed8" strokeWidth="0.5" />
              <path d="M12 11L16 13L20 11" stroke="#1d4ed8" strokeWidth="0.5" fill="none" />
            </svg>
            <span className="font-semibold text-gray-900">MailMountains</span>
          </div>
          <Button variant="outline" onClick={handleBackToDashboard}>
            Back to Dashboard
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Choose Your Quantity</h1>
          <p className="text-gray-600">Select the number of servers for your cold email infrastructure.</p>
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> You can order 1 server at a time. If you need multiple servers, 
              please complete your order for 1 server first, then place another order for additional servers.
            </p>
          </div>
        </div>

        <div className="mb-8 max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Number of Servers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  -
                </Button>
                <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
                <Button variant="outline" size="sm" onClick={() => setQuantity(quantity + 1)}>
                  +
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="max-w-md mx-auto">
          <Card className="border-2 border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-xl text-center">{getInboxRange()} Inboxes</CardTitle>
              <div className="mt-4 text-center">
                <div className="text-sm text-gray-600 mb-2">Sending Volume: {calculateSendingVolume()}k/month</div>
                <div className="text-3xl font-bold text-gray-900">
                  ${calculateFinalPrice()}
                  <span className="text-lg font-normal text-gray-600">/month</span>
                </div>
                {appliedCoupon && (
                  <div className="text-sm text-green-600 mb-2">
                    Discount: -${getDiscountAmount().toFixed(2)}
                    {appliedCoupon.percent_off && ` (${appliedCoupon.percent_off}% off)`}
                  </div>
                )}
                <div className="text-sm text-gray-600">
                  {quantity} server{quantity > 1 ? "s" : ""} × $200/month
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Coupon Code (Optional)</label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                    <span className="text-green-700 font-medium">{couponCode} applied</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeCoupon}
                      className="text-green-700 hover:text-green-800"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="Enter coupon code"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        onClick={validateCoupon}
                        disabled={!couponCode.trim() || isValidatingCoupon}
                      >
                        {isValidatingCoupon ? "..." : "Apply"}
                      </Button>
                    </div>
                    {couponError && <p className="text-sm text-red-600">{couponError}</p>}
                  </div>
                )}
              </div>

              {/* Checkout Error Display */}
              {checkoutError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{checkoutError}</p>
                </div>
              )}

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handlePurchase}
                disabled={isLoading}
              >
                {isLoading ? "Processing..." : "Purchase"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
