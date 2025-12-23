import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const BLACKLISTMASTER_API_BASE = 'https://www.blacklistmaster.com/restapi/v1'
const BLACKLISTMASTER_API_KEY = process.env.BLACKLISTMASTER_API_KEY
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
const CRON_SECRET = process.env.CRON_SECRET

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

// POST - Check all active server IPs (scheduled job)
// This endpoint should be called by a cron job or scheduled task
export async function POST(request: NextRequest) {
  try {
    // Protect the cron endpoint with a secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!BLACKLISTMASTER_API_KEY) {
      return NextResponse.json({ error: "BlacklistMaster API key not configured" }, { status: 500 })
    }

    // Get all active servers with IP addresses
    const activeServers = await prisma.server.findMany({
      where: {
        status: {
          in: ['active', 'pending']
        },
        ipAddress: {
          not: null
        }
      }
    })

    console.log(`Checking ${activeServers.length} active server IPs for blacklist status...`)

    const results = {
      checked: 0,
      blacklisted: 0,
      errors: 0,
      notifications: 0
    }

    // Check each IP with a small delay to respect rate limits (5 calls/second = 200ms between calls)
    for (const server of activeServers) {
      if (!server.ipAddress) continue

      try {
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200))

        const blacklistResult = await checkIPBlacklist(server.ipAddress)

        if (!blacklistResult) {
          results.errors++
          continue
        }

        // Get previous blacklist status
        const wasBlacklisted = server.blacklistStatus === 'Blacklisted'
        const isBlacklisted = blacklistResult.status === 'Blacklisted'

        // Update server with blacklist status
        await prisma.server.update({
          where: { id: server.id },
          data: {
            blacklistStatus: blacklistResult.status,
            blacklistSeverity: blacklistResult.blacklistSeverity,
            blacklistLastChecked: new Date(),
            blacklists: blacklistResult.blacklists,
            updatedAt: new Date()
          }
        })

        results.checked++

        // Send Slack notification if newly blacklisted or still blacklisted
        if (isBlacklisted) {
          results.blacklisted++
          if (!wasBlacklisted) {
            await sendSlackNotification(server, blacklistResult)
            results.notifications++
          }
        }
      } catch (error: any) {
        console.error(`Error checking IP ${server.ipAddress} for server ${server.id}:`, error)
        results.errors++
      }
    }

    console.log(`Blacklist check complete: ${results.checked} checked, ${results.blacklisted} blacklisted, ${results.errors} errors, ${results.notifications} notifications sent`)

    return NextResponse.json({
      success: true,
      results
    })
  } catch (error: any) {
    console.error("Error checking all IPs:", error)
    return NextResponse.json({
      error: "Failed to check IPs",
      message: error.message
    }, { status: 500 })
  }
}

