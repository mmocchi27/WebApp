import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import Stripe from "stripe"

const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2025-07-30.basil",
  })
export async function GET(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's organization (either from auth or fetch first org)
    let organizationId = orgId
    
    if (!organizationId) {
      const client = clerkClient
      const orgMemberships = await client.users.getOrganizationMembershipList({ userId })
      if (orgMemberships.data && orgMemberships.data.length > 0) {
        organizationId = orgMemberships.data[0].organization.id
      }
    }

    // User must have an organization to view subscriptions
    if (!organizationId) {
      return NextResponse.json({
        subscriptions: [],
      })
    }

    // Get all subscription IDs for this organization from the database
    // This ensures we only show subscriptions that belong to THIS org
    const { prisma } = await import("@/lib/prisma")
    const orgServers = await prisma.server.findMany({
      where: {
        organizationId: organizationId,
      },
      select: {
        id: true,
        subscriptionId: true,
        serverName: true,
        ipAddress: true,
        status: true,
      },
    })

    for (const server of orgServers) {
      if (!server.serverName && server.subscriptionId && stripe) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(server.subscriptionId)
          const stripeName =
            stripeSub.metadata?.serverName?.trim() ||
            stripeSub.description?.trim() ||
            null
          if (stripeName) {
            await prisma.server.update({
              where: { id: server.id },
              data: {
                serverName: stripeName,
                updatedAt: new Date(),
              },
            })
            server.serverName = stripeName
          }
        } catch (err) {
          console.error(
            `Failed to sync server name from Stripe for subscription ${server.subscriptionId}:`,
            err
          )
        }
      }
    }

    const formattedSubscriptions = orgServers.map(server => ({
      id: server.id,
      status: server.status || "active",
      current_period_end: null,
      orderNumber: server.id.substring(0, 8).toUpperCase(),
      serverName: server.serverName || null,
      domainList: null,
      ipAddress: server.ipAddress || null,
      subscriptionId: server.subscriptionId,
    }))

    return NextResponse.json({
      subscriptions: formattedSubscriptions,
    })
  } catch (error) {
    console.error("Error fetching subscriptions:", error)
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 })
  }
}
