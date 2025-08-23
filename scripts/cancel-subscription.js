// One-time script to cancel a specific Stripe subscription by order number
// Usage: Replace ORDER_NUMBER with the order number from your dashboard (e.g., "1RX7R38P")

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

async function cancelSubscriptionByOrderNumber() {
  try {
    // The order number you want to cancel (from the dashboard)
    const TARGET_ORDER_NUMBER = "1RX7R38P" // Replace with your actual order number

    console.log(`Looking for subscription with order number: ${TARGET_ORDER_NUMBER}`)

    // Fetch all active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      status: "active",
      limit: 100, // Increased limit to ensure we find the right one
    })

    console.log(`Found ${subscriptions.data.length} active subscriptions`)

    // Find the subscription that matches the order number
    let targetSubscription = null

    for (const sub of subscriptions.data) {
      // Generate order number from subscription ID (same logic as dashboard)
      const orderNumber = sub.id.substring(4, 12).toUpperCase()
      console.log(`Subscription ${sub.id} -> Order Number: ${orderNumber}`)

      if (orderNumber === TARGET_ORDER_NUMBER) {
        targetSubscription = sub
        break
      }
    }

    if (targetSubscription) {
      console.log(`\n✅ Found matching subscription!`)
      console.log(`Subscription ID: ${targetSubscription.id}`)
      console.log(`Order Number: ${TARGET_ORDER_NUMBER}`)
      console.log(`Customer: ${targetSubscription.customer}`)
      console.log(`Status: ${targetSubscription.status}`)

      console.log(`\nCancelling subscription...`)
      const cancelledSubscription = await stripe.subscriptions.cancel(targetSubscription.id)

      console.log("✅ Subscription cancelled successfully!")
      console.log(`Cancelled at: ${new Date(cancelledSubscription.canceled_at * 1000)}`)
    } else {
      console.log(`❌ No active subscription found with order number: ${TARGET_ORDER_NUMBER}`)
      console.log("Available order numbers:")
      subscriptions.data.forEach((sub) => {
        const orderNumber = sub.id.substring(4, 12).toUpperCase()
        console.log(`  - ${orderNumber} (${sub.id})`)
      })
    }
  } catch (error) {
    console.error("❌ Error cancelling subscription:", error.message)
  }
}

cancelSubscriptionByOrderNumber()
