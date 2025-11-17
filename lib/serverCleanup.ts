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

  if (!server.ipAddress || !server.apiKey) {
    console.warn(
      `⚠️  Server ${server.id} missing MailCow credentials; skipping mailbox cleanup`
    )
  }

  const domains = await prisma.domain.findMany({
    where: { serverId: server.id },
  })

  for (const domain of domains) {
    try {
      await deleteInboxesForDomain(domain.domainName, server.id, server.ipAddress, server.apiKey)

      if (domain.cloudflareZoneId && CLOUDFLARE_TOKEN) {
        await deleteDomainFromCloudflare(domain.domainName, domain.cloudflareZoneId)
      }

      if (server.ipAddress && server.apiKey) {
        await deleteDomainFromMailCow(domain.domainName, server.ipAddress, server.apiKey)
      }

      await prisma.domain.delete({ where: { id: domain.id } })
      console.log(`  ✅ Removed domain ${domain.domainName} for server ${server.id}`)
    } catch (error: any) {
      console.error(`  ❌ Failed to clean domain ${domain.domainName}:`, error?.message)
    }
  }

  await prisma.inbox.deleteMany({ where: { serverId: server.id } })
  await prisma.domain.deleteMany({ where: { serverId: server.id } })
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

  console.log(`    🌀 Removing Cloudflare zone ${zoneId} for ${domainName}`)
  try {
    await axios.delete(`${CLOUDFLARE_API_BASE}/zones/${zoneId}`, {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_TOKEN}`,
        "Content-Type": "application/json",
      },
    })
    console.log(`    ✅ Cloudflare zone removed for ${domainName}`)
  } catch (error: any) {
    console.error(`    ❌ Failed to delete Cloudflare zone for ${domainName}:`, error?.message)
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

