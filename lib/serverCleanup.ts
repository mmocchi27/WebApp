import axios from "axios"
import https from "https"
import { prisma } from "@/lib/prisma"

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"
const CLOUDFLARE_TOKEN = process.env.CLOUDFLARE_API_TOKEN

type MinimalServer = {
  id: string
  subscriptionId?: string | null
  ipAddress: string | null
  apiKey: string | null
}

export async function cleanupServerResources(server: MinimalServer) {
  if (!server) return

  console.log(`🧹 Starting cleanup for server ${server.id}`)

  // Step 1: Delete all inboxes from MailCow and database
  console.log(`📨 Step 1: Deleting all inboxes for server ${server.id}`)
  const allInboxes = await prisma.inbox.findMany({
    where: { serverId: server.id },
    select: { id: true, email: true, domainName: true },
  })

  if (allInboxes.length > 0) {
    if (server.ipAddress && server.apiKey) {
      // Group inboxes by domain for better organization in logs
      const inboxesByDomain = allInboxes.reduce((acc, inbox) => {
        if (!acc[inbox.domainName]) {
          acc[inbox.domainName] = []
        }
        acc[inbox.domainName].push(inbox)
        return acc
      }, {} as Record<string, typeof allInboxes>)

      // Delete inboxes from MailCow (grouped by domain, but we'll delete all at once if possible)
      // MailCow API accepts an array of email addresses
      const allEmails = allInboxes.map((inbox) => inbox.email)
      const httpsAgent = new https.Agent({ rejectUnauthorized: false })

      try {
        await axios.post(
          `https://${server.ipAddress}/api/v1/delete/mailbox`,
          allEmails,
          {
            headers: {
              "X-API-Key": server.apiKey,
              "Content-Type": "application/json",
            },
            timeout: 60000, // Increased timeout for bulk operations
            httpsAgent,
          }
        )
        console.log(`    ✅ Deleted ${allEmails.length} mailbox(es) from MailCow for server ${server.id}`)
      } catch (error: any) {
        console.error(`    ❌ Failed to delete mailboxes from MailCow:`, error?.message)
        // Continue to delete from database even if MailCow deletion fails
      }
    } else {
      console.warn(
        `⚠️  Server ${server.id} missing MailCow credentials; skipping MailCow mailbox cleanup`
      )
    }

    // Delete all inboxes from database
    await prisma.inbox.deleteMany({ where: { serverId: server.id } })
    console.log(`    ✅ Deleted ${allInboxes.length} inbox record(s) from database`)
  } else {
    console.log(`    ℹ️  No inboxes found for server ${server.id}`)
  }

  // Step 2: Delete all domains from MailCow, Cloudflare, and database
  console.log(`🌐 Step 2: Deleting all domains for server ${server.id}`)
  const domains = await prisma.domain.findMany({
    where: { serverId: server.id },
  })

  if (domains.length > 0) {
    for (const domain of domains) {
      try {
        // Delete from Cloudflare (if zone ID exists)
        if (domain.cloudflareZoneId && CLOUDFLARE_TOKEN) {
          await deleteDomainFromCloudflare(domain.domainName, domain.cloudflareZoneId)
        } else {
          console.log(`    ⚠️  No Cloudflare zone ID for ${domain.domainName}, skipping Cloudflare cleanup`)
        }

        // Delete from MailCow
        if (server.ipAddress && server.apiKey) {
          await deleteDomainFromMailCow(domain.domainName, server.ipAddress, server.apiKey)
        } else {
          console.log(`    ⚠️  Missing MailCow credentials, skipping MailCow domain deletion for ${domain.domainName}`)
        }

        // Delete from database
        await prisma.domain.delete({ where: { id: domain.id } })
        console.log(`    ✅ Removed domain ${domain.domainName} for server ${server.id}`)
      } catch (error: any) {
        console.error(`    ❌ Failed to clean domain ${domain.domainName}:`, error?.message)
      }
    }
  } else {
    console.log(`    ℹ️  No domains found for server ${server.id}`)
  }

  // Final cleanup: ensure no orphaned records remain
  await prisma.inbox.deleteMany({ where: { serverId: server.id } })
  await prisma.domain.deleteMany({ where: { serverId: server.id } })

  console.log(`✅ Cleanup completed for server ${server.id}`)
}

export async function cleanupSubscriptionResources(subscriptionId: string) {
  const servers = await prisma.server.findMany({
    where: { subscriptionId },
  })

  if (servers.length === 0) {
    console.log(`⚠️  No server found for subscription ${subscriptionId}`)
    return
  }

  for (const server of servers) {
    console.log(`🧹 Cleaning up server ${server.id} for cancelled subscription ${subscriptionId}`)
    await cleanupServerResources(server)
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "cancelled", updatedAt: new Date() },
    })
  }

  console.log(`✅ All resources deleted for subscription ${subscriptionId}`)
}

export async function deleteInboxesForDomain(
  domainName: string,
  serverId: string,
  ipAddress: string | null,
  apiKey: string | null
) {
  const inboxes = await prisma.inbox.findMany({
    where: { serverId, domainName },
    select: { id: true, email: true },
  })

  if (inboxes.length === 0) {
    return
  }

  if (!ipAddress || !apiKey) {
    console.warn(
      `⚠️  Missing MailCow credentials for server ${serverId}; deleting inbox records locally only`
    )
    await prisma.inbox.deleteMany({ where: { id: { in: inboxes.map((i) => i.id) } } })
    return
  }

  const emails = inboxes.map((inbox) => inbox.email)
  const httpsAgent = new https.Agent({ rejectUnauthorized: false })

  try {
    await axios.post(
      `https://${ipAddress}/api/v1/delete/mailbox`,
      emails,
      {
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 30000,
        httpsAgent,
      }
    )
    console.log(`    📨 Deleted ${emails.length} mailbox(es) for ${domainName} from MailCow`)
  } catch (error: any) {
    console.error(`    ❌ Failed to delete mailboxes for ${domainName}:`, error?.message)
  }

  await prisma.inbox.deleteMany({ where: { id: { in: inboxes.map((i) => i.id) } } })
}

export async function deleteDomainFromCloudflare(domainName: string, zoneId: string) {
  if (!CLOUDFLARE_TOKEN) {
    console.warn("CLOUDFLARE_API_TOKEN missing; skipping Cloudflare cleanup")
    return
  }

  console.log(`    🌀 Removing DNS records from Cloudflare zone ${zoneId} for ${domainName}`)
  try {
    // Fetch all DNS records for the zone
    const recordsResponse = await axios.get(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`, {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_TOKEN}`,
        "Content-Type": "application/json",
      },
    })

    const records = recordsResponse.data.result || []
    console.log(`    📋 Found ${records.length} DNS records to delete for ${domainName}`)

    // Delete each DNS record
    for (const record of records) {
      try {
        await axios.delete(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records/${record.id}`, {
          headers: {
            Authorization: `Bearer ${CLOUDFLARE_TOKEN}`,
            "Content-Type": "application/json",
          },
        })
      } catch (delError: any) {
        console.error(`    ⚠️  Failed to delete DNS record ${record.name}:`, delError?.message)
      }
    }

    console.log(`    ✅ DNS records removed for ${domainName} (zone kept in Cloudflare)`)
  } catch (error: any) {
    console.error(`    ❌ Failed to delete DNS records for ${domainName}:`, error?.message)
  }
}

export async function deleteDomainFromMailCow(domainName: string, ipAddress: string, apiKey: string) {
  const httpsAgent = new https.Agent({ rejectUnauthorized: false })
  try {
    await axios.post(
      `https://${ipAddress}/api/v1/delete/domain`,
      { domain: domainName },
      {
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 10000,
        httpsAgent,
      }
    )
    console.log(`    ✅ Domain removed from MailCow: ${domainName}`)
  } catch (error: any) {
    console.error(`    ❌ Failed to delete domain ${domainName} from MailCow:`, error?.message)
  }
}

