import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import axios from "axios"
import https from "https"

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'
const CLOUDFLARE_TOKEN = process.env.CLOUDFLARE_API_TOKEN

// Create axios instance for MailCow that allows self-signed certificates
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
})

async function deleteDomainFromCloudflare(domainName: string, zoneId: string) {
  console.log(`🗑️  Deleting Cloudflare resources for ${domainName}...`)
  
  // Step 1: Delete all DNS records
  try {
    const dnsResponse = await axios.get(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`,
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (dnsResponse.data?.success && Array.isArray(dnsResponse.data.result)) {
      for (const record of dnsResponse.data.result) {
        if (record.id) {
          try {
            await axios.delete(
              `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records/${record.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
                  'Content-Type': 'application/json'
                }
              }
            )
            console.log(`  ✅ Deleted DNS record: ${record.type} ${record.name}`)
          } catch (e: any) {
            console.warn(`  ⚠️ Failed to delete DNS record ${record.id}:`, e?.message)
          }
        }
      }
    }
  } catch (error: any) {
    console.warn(`  ⚠️ Failed to fetch/delete DNS records:`, error?.message)
  }

  // Step 2: Delete all page rules
  try {
    const pageRulesResponse = await axios.get(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/pagerules`,
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (pageRulesResponse.data?.success && Array.isArray(pageRulesResponse.data.result)) {
      for (const rule of pageRulesResponse.data.result) {
        if (rule.id) {
          try {
            await axios.delete(
              `${CLOUDFLARE_API_BASE}/zones/${zoneId}/pagerules/${rule.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
                  'Content-Type': 'application/json'
                }
              }
            )
            console.log(`  ✅ Deleted page rule ${rule.id}`)
          } catch (e: any) {
            console.warn(`  ⚠️ Failed to delete page rule ${rule.id}:`, e?.message)
          }
        }
      }
    }
  } catch (error: any) {
    console.warn(`  ⚠️ Failed to fetch/delete page rules:`, error?.message)
  }

  // Step 3: Delete redirect rules (rulesets)
  try {
    const rulesetsResponse = await axios.get(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/rulesets`,
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (rulesetsResponse.data?.success && Array.isArray(rulesetsResponse.data.result)) {
      for (const ruleset of rulesetsResponse.data.result) {
        if (ruleset.phase === 'http_request_dynamic_redirect' && ruleset.id) {
          try {
            await axios.delete(
              `${CLOUDFLARE_API_BASE}/zones/${zoneId}/rulesets/${ruleset.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
                  'Content-Type': 'application/json'
                }
              }
            )
            console.log(`  ✅ Deleted redirect ruleset ${ruleset.id}`)
          } catch (e: any) {
            console.warn(`  ⚠️ Failed to delete ruleset ${ruleset.id}:`, e?.message)
          }
        }
      }
    }
  } catch (error: any) {
    console.warn(`  ⚠️ Failed to fetch/delete rulesets:`, error?.message)
  }

  console.log(`  ✅ Cloudflare cleanup completed for ${domainName}`)
}

async function deleteInboxesForDomain(domainName: string, serverId: string, ipAddress: string, apiKey: string) {
  const inboxes = await prisma.inbox.findMany({
    where: {
      serverId,
      domainName,
    },
    select: { id: true, email: true },
  })

  if (inboxes.length === 0) {
    console.log(`  🔍 No inboxes found for ${domainName}, skipping mailbox cleanup`)
    return
  }

  const emails = inboxes.map((inbox) => inbox.email)
  console.log(`  📨 Deleting ${emails.length} inbox(es) for ${domainName} before domain removal`)

  try {
    await axiosInstance.post(
      `https://${ipAddress}/api/v1/delete/mailbox`,
      emails,
      {
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    )
    console.log(`    ✅ Deleted inboxes from MailCow for ${domainName}`)
  } catch (error: any) {
    console.error(`    ❌ Failed to delete inboxes from MailCow for ${domainName}:`, error?.message)
    throw new Error(`Failed to delete inboxes for ${domainName}. Please delete inboxes before removing the domain.`)
  }

  await prisma.inbox.deleteMany({
    where: {
      id: {
        in: inboxes.map((inbox) => inbox.id),
      },
    },
  })
  console.log(`    ✅ Deleted inbox records from database for ${domainName}`)
}

async function deleteDomainFromMailCow(domainName: string, ipAddress: string, apiKey: string) {
  console.log(`🗑️  Deleting domain from MailCow: ${domainName}...`)
  
  try {
    const response = await axiosInstance.post(
      `https://${ipAddress}/api/v1/delete/domain`,
      { domain: domainName },
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )

    if (response.status === 200 || response.status === 201) {
      console.log(`  ✅ Deleted domain from MailCow: ${domainName}`)
      return true
    } else {
      console.log(`  ⚠️ MailCow response status: ${response.status}`)
      return false
    }
  } catch (error: any) {
    console.error(`  ❌ Failed to delete from MailCow: ${error.message}`)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!CLOUDFLARE_TOKEN) {
      return NextResponse.json({ 
        error: "Cloudflare API token not configured" 
      }, { status: 500 })
    }

    const { serverId, domainNames } = await request.json()
    
    if (!serverId || !Array.isArray(domainNames) || domainNames.length === 0) {
      return NextResponse.json({ 
        error: "Server ID and domain names are required" 
      }, { status: 400 })
    }

    // Get server details from database (prefer actual server ID, fall back to legacy subscriptionId)
    let server = await prisma.server.findUnique({
      where: { id: serverId }
    })

    if (!server) {
      server = await prisma.server.findFirst({
        where: { subscriptionId: serverId }
      })
    }

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    // Verify user has access to this server
    if (server.organizationId !== orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Check if server has credentials for MailCow
    if (!server.ipAddress || !server.apiKey) {
      return NextResponse.json({ 
        error: "Server not configured",
        message: "Server does not have IP address or API key configured" 
      }, { status: 400 })
    }

    const results = []

    for (const domainName of domainNames) {
      console.log(`\n${'='.repeat(50)}`)
      console.log(`Deleting domain: ${domainName}`)
      console.log('='.repeat(50))

      try {
        // Get domain details from database
        const domain = await prisma.domain.findFirst({
          where: {
            domainName: domainName,
            serverId: server.id
          }
        })

        if (!domain) {
          results.push({
            domain: domainName,
            success: false,
            message: "Domain not found in database"
          })
          continue
        }

        // Step 1: Delete inboxes associated with this domain
        await deleteInboxesForDomain(domainName, server.id, server.ipAddress, server.apiKey)

        // Step 2: Delete from Cloudflare (if zone ID exists)
        if (domain.cloudflareZoneId) {
          await deleteDomainFromCloudflare(domainName, domain.cloudflareZoneId)
        } else {
          console.log(`  ⚠️ No Cloudflare zone ID for ${domainName}, skipping Cloudflare cleanup`)
        }

        // Step 3: Delete from MailCow
        await deleteDomainFromMailCow(domainName, server.ipAddress, server.apiKey)

        // Step 4: Delete from database
        await prisma.domain.delete({
          where: { id: domain.id }
        })
        console.log(`  ✅ Deleted from database: ${domainName}`)

        results.push({
          domain: domainName,
          success: true,
          message: "Successfully deleted from all systems"
        })

      } catch (error: any) {
        console.error(`❌ Error deleting ${domainName}:`, error.message)
        results.push({
          domain: domainName,
          success: false,
          message: error.message || "Failed to delete domain"
        })
      }
    }

    const successCount = results.filter(r => r.success).length

    return NextResponse.json({ 
      success: successCount > 0,
      deleted: successCount,
      total: domainNames.length,
      results
    })

  } catch (error: any) {
    console.error("Error deleting domains:", error)
    return NextResponse.json({ 
      error: "Failed to delete domains", 
      message: error.message 
    }, { status: 500 })
  }
}

