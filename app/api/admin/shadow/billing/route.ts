import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmail = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId
    )?.emailAddress
    const adminEmail = process.env.ADMIN_EMAIL || "mitch@mailmountains.com"
    return userEmail === adminEmail
  } catch {
    return false
  }
}

const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2025-07-30.basil",
  })

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const orgId = request.nextUrl.searchParams.get("orgId")?.trim()
    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 })
    }

    const servers = await prisma.server.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    })

    // Attempt to fetch Stripe customer for this org
    let stripeCustomer: Stripe.Customer | null = null
    let stripeSubscriptions: Stripe.Subscription[] = []

    if (stripe) {
      try {
        const customers = await stripe.customers.search({
          query: `metadata['clerkOrgId']:'${orgId}'`,
          limit: 1,
        })
        if (customers.data.length > 0) {
          stripeCustomer = customers.data[0]
          const subs = await stripe.subscriptions.list({
            customer: stripeCustomer.id,
            limit: 100,
          })
          stripeSubscriptions = subs.data
        }
      } catch (err) {
        console.error("Stripe lookup failed in shadow/billing:", err)
      }
    }

    const formatted = servers.map((s) => {
      const stripeSub = stripeSubscriptions.find((sub) => sub.id === s.subscriptionId)
      return {
        id: s.id,
        subscriptionId: s.subscriptionId,
        serverName: s.serverName,
        ipAddress: s.ipAddress,
        status: s.status,
        domainLimit: s.domainLimit,
        inboxLimit: s.inboxLimit,
        createdAt: s.createdAt,
        stripeStatus: stripeSub?.status ?? null,
        currentPeriodEnd: stripeSub?.current_period_end ?? null,
        cancelAtPeriodEnd: stripeSub?.cancel_at_period_end ?? null,
      }
    })

    return NextResponse.json({
      subscriptions: formatted,
      stripeCustomerId: stripeCustomer?.id ?? null,
      stripeCustomerEmail: (stripeCustomer as any)?.email ?? null,
    })
  } catch (error) {
    console.error("Error in shadow/billing:", error)
    return NextResponse.json({ error: "Failed to fetch billing" }, { status: 500 })
  }
}
