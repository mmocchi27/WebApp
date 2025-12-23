import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const BLACKLISTMASTER_API_BASE = 'https://www.blacklistmaster.com/restapi/v1'
const BLACKLISTMASTER_API_KEY = process.env.BLACKLISTMASTER_API_KEY
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

// Helper function to check if user is admin
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress
    const adminEmail = process.env.ADMIN_EMAIL || 'mitch@mailmountains.com'
    return userEmail === adminEmail
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}

// Check IP blacklist status using BlacklistMaster API
async function checkIPBlacklist(ipAddress: string): Promise<{
  status: string
  blacklistSeverity: string | null
  blacklists: Array<{
    blacklist: string
    blacklist_name: string
    blacklist_url: string
    blacklist_severity: string
  }>
} | null> {
  if (!BLACKLISTMASTER_API_KEY) {
    throw new Error('BlacklistMaster API key not configured')
  }

  try {
    const response = await fetch(
      `${BLACKLISTMASTER_API_BASE}/blacklistcheck/ip/${ipAddress}?apikey=${BLACKLISTMASTER_API_KEY}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (response.status === 204) {
      // IP not monitored
      return {
        status: 'Not blacklisted',
        blacklistSeverity: null,
        blacklists: []
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.response || `API returned status ${response.status}`)
    }

    const data = await response.json()

    if (data.status === 'ERROR') {
      throw new Error(data.response || 'Unknown error from BlacklistMaster API')
    }

    return {
      status: data.status || 'Not blacklisted',
      blacklistSeverity: data.blacklist_severity || null,
      blacklists: data.blacklists || []
    }
  } catch (error: any) {
    console.error(`Error checking blacklist for IP ${ipAddress}:`, error)
    throw error
  }
}

// Send Slack notification
async function sendSlackNotification(server: any, blacklistResult: any) {
  if (!SLACK_WEBHOOK_URL) {
    console.log('Slack webhook URL not configured, skipping notification')
    return
  }

  const blacklistList = blacklistResult.blacklists
    .map((bl: any) => `• ${bl.blacklist_name} (${bl.blacklist}) - ${bl.blacklist_severity || 'Unknown'} severity`)
    .join('\n')

  const message = {
    text: `🚨 IP Address Blacklisted: ${server.ipAddress}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚨 IP Address Blacklisted: ${server.ipAddress}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*IP Address:*\n\`${server.ipAddress}\``
          },
          {
            type: 'mrkdwn',
            text: `*Server:*\n${server.serverName || 'Unnamed Server'}`
          },
          {
            type: 'mrkdwn',
            text: `*Subscription ID:*\n${server.subscriptionId}`
          },
          {
            type: 'mrkdwn',
            text: `*Severity:*\n${blacklistResult.blacklistSeverity || 'None'}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Blacklists (${blacklistResult.blacklists.length}):*\n${blacklistList || 'None'}`
        }
      }
    ]
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      console.error('Failed to send Slack notification:', response.statusText)
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error)
  }
}

// POST - Check blacklist status for a specific server IP
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin
    if (!await isAdmin(userId)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const { serverId } = await request.json()

    if (!serverId) {
      return NextResponse.json({ error: "Server ID is required" }, { status: 400 })
    }

    // Get server
    const server = await prisma.server.findUnique({
      where: { id: serverId }
    })

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    if (!server.ipAddress) {
      return NextResponse.json({ error: "Server does not have an IP address configured" }, { status: 400 })
    }

    // Check blacklist status
    const blacklistResult = await checkIPBlacklist(server.ipAddress)

    if (!blacklistResult) {
      return NextResponse.json({ error: "Failed to check blacklist status" }, { status: 500 })
    }

    // Update server with blacklist status
    const updatedServer = await prisma.server.update({
      where: { id: server.id },
      data: {
        blacklistStatus: blacklistResult.status,
        blacklistSeverity: blacklistResult.blacklistSeverity,
        blacklistLastChecked: new Date(),
        blacklists: blacklistResult.blacklists,
        updatedAt: new Date()
      }
    })

    // Send Slack notification if blacklisted
    if (blacklistResult.status === 'Blacklisted') {
      await sendSlackNotification(updatedServer, blacklistResult)
    }

    return NextResponse.json({
      success: true,
      server: updatedServer,
      blacklistResult
    })
  } catch (error: any) {
    console.error("Error checking IP blacklist:", error)
    return NextResponse.json({
      error: "Failed to check IP blacklist",
      message: error.message
    }, { status: 500 })
  }
}

