import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import axios from "axios"
import https from "https"

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'
const CLOUDFLARE_TOKEN = process.env.CLOUDFLARE_API_TOKEN

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

// Create axios instance for MailCow that allows self-signed certificates
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
})

async function resetDnsForDomain(domain: string, zoneId: string, serverId: string) {
  console.log(`🔄 Resetting DNS for ${domain}...`)

  // Get server details
  const server = await prisma.server.findUnique({
    where: { id: serverId }
  })

  if (!server || !server.hostname || !server.ipAddress || !server.apiKey) {
    throw new Error('Server not found or missing required fields (hostname, IP, API key)')
  }

  const hostname = server.hostname
  const smtpIp = server.ipAddress
  const apiKey = server.apiKey

  console.log(`  Using hostname: ${hostname}, IP: ${smtpIp}`)

  // Step 1: Delete all existing DNS records in Cloudflare
  console.log(`  🗑️ Deleting existing DNS records...`)
  let deletedCount = 0
  try {
    const getRecordsResponse = await axios.get(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`,
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (getRecordsResponse.data.success) {
      const records = getRecordsResponse.data.result || []
      console.log(`  Found ${records.length} existing DNS records`)

      for (const record of records) {
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
          deletedCount++
          console.log(`    ✅ Deleted ${record.type} record: ${record.name}`)
        } catch (error: any) {
          console.log(`    ⚠️ Failed to delete ${record.type} record: ${record.name} - ${error.message}`)
        }
      }
    }
  } catch (error: any) {
    console.error(`  ❌ Failed to fetch DNS records: ${error.message}`)
    throw new Error(`Failed to fetch existing DNS records: ${error.message}`)
  }

  // Step 2: Get DKIM key from MailCow
  console.log(`  🔑 Getting DKIM key from MailCow...`)
  let dkimKey = ''
  try {
    const dkimResponse = await axiosInstance.get(
      `https://${smtpIp}/api/v1/get/dkim/${domain}`,
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )

    if (dkimResponse.status === 200) {
      const data = dkimResponse.data
      if (Array.isArray(data) && data.length > 0) {
        dkimKey = data[0].dkim_txt || ''
      } else if (typeof data === 'object') {
        dkimKey = data.dkim_txt || ''
      }
      
      if (dkimKey) {
        console.log(`  ✅ Retrieved DKIM key for ${domain}`)
      } else {
        console.log(`  ⚠️ No DKIM key found for ${domain}`)
      }
    }
  } catch (error: any) {
    console.log(`  ⚠️ Failed to get DKIM key: ${error.message}`)
  }

  // Step 3: Create DNS records in Cloudflare
  console.log(`  📝 Creating DNS records...`)

  const mxRecord = `mail.${domain}`
  const spfRecord = `v=spf1 include:spf.${hostname} -all`
  const dmarcRecord = `v=DMARC1; p=reject; rua=mailto:spam@${hostname}; ruf=mailto:spam@${hostname}; sp=reject; fo=0:1:d:s; adkim=s; aspf=s`

  const dnsRecords = [
    {
      type: 'A',
      name: domain,
      content: '192.0.2.1',
      proxied: true,
      ttl: 1
    },
    {
      type: 'A',
      name: `mail.${domain}`,
      content: smtpIp,
      proxied: false,
      ttl: 1
    },
    {
      type: 'A',
      name: `www.${domain}`,
      content: '192.0.2.1',
      proxied: true,
      ttl: 1
    },
    {
      type: 'MX',
      name: domain,
      content: mxRecord,
      priority: 10,
      ttl: 1
    },
    {
      type: 'TXT',
      name: domain,
      content: spfRecord,
      ttl: 1
    },
    {
      type: 'TXT',
      name: `_dmarc.${domain}`,
      content: dmarcRecord,
      ttl: 1
    }
  ]

  // Add DKIM record if we have the key
  if (dkimKey) {
    dnsRecords.push({
      type: 'TXT',
      name: `dkim._domainkey.${domain}`,
      content: dkimKey,
      ttl: 1
    })
  }

  let successCount = 0
  const createdRecords: string[] = []
  const failedRecords: string[] = []

  for (const record of dnsRecords) {
    try {
      const createResponse = await axios.post(
        `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`,
        record,
        {
          headers: {
            'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (createResponse.data.success) {
        console.log(`    ✅ Created ${record.type} record: ${record.name}`)
        successCount++
        createdRecords.push(`${record.type}: ${record.name}`)
      } else {
        console.log(`    ❌ Failed to create ${record.type} record: ${record.name}`)
        failedRecords.push(`${record.type}: ${record.name}`)
      }
    } catch (error: any) {
      console.log(`    ❌ Error creating ${record.type} record: ${record.name} - ${error.message}`)
      failedRecords.push(`${record.type}: ${record.name} (${error.message})`)
    }
  }

  // Step 4: Update database
  console.log(`  💾 Updating database...`)
  await prisma.domain.update({
    where: {
      domainName_serverId: {
        domainName: domain,
        serverId: serverId
      }
    },
    data: {
      dnsConfigured: successCount > 0,
      mxRecord: mxRecord,
      spfRecord: spfRecord,
      dmarcRecord: dmarcRecord,
      dkimRecord: dkimKey || null,
      updatedAt: new Date()
    }
  })

  console.log(`✅ DNS reset completed for ${domain}: ${successCount}/${dnsRecords.length} records created`)

  return {
    domain,
    deleted: deletedCount,
    created: successCount,
    total: dnsRecords.length,
    createdRecords,
    failedRecords,
    hasDkim: !!dkimKey
  }
}

async function configureMasterDomainRedirect(
  domainName: string,
  zoneId: string,
  masterDomain: string
) {
  console.log(`🌐 Setting up master domain redirect for ${domainName} → ${masterDomain}`)

  // Step 1: Delete old Redirect Rules
  console.log(`  🗑️ Clearing old Redirect Rules...`)
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
            console.log(`    ✅ Deleted redirect ruleset ${ruleset.id}`)
          } catch (e: any) {
            console.warn(`    ⚠️ Failed to delete ruleset ${ruleset.id}:`, e?.message)
          }
        }
      }
    }
  } catch (e: any) {
    console.warn(`  ⚠️ Could not clear redirect rules:`, e?.message)
  }

  // Step 2: Delete old Page Rules
  console.log(`  🗑️ Clearing old Page Rules...`)
  try {
    const listResponse = await axios.get(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/pagerules`,
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (listResponse.data?.success && Array.isArray(listResponse.data.result)) {
      for (const rule of listResponse.data.result) {
        if (!rule.id) continue
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
          console.log(`    ✅ Deleted page rule ${rule.id}`)
        } catch (e: any) {
          console.warn(`    ⚠️ Failed to delete page rule ${rule.id}:`, e?.message)
        }
      }
    }
  } catch (e: any) {
    console.warn(`  ⚠️ Could not clear page rules:`, e?.message)
  }

  // Step 3: Create new page rules for redirect
  const rules = [
    { source: `${domainName}/*`, priority: 1 },
    { source: `www.${domainName}/*`, priority: 2 }
  ]

  for (const rule of rules) {
    const payload = {
      targets: [
        {
          target: 'url',
          constraint: {
            operator: 'matches',
            value: rule.source
          }
        }
      ],
      actions: [
        {
          id: 'forwarding_url',
          value: {
            url: `https://${masterDomain}/$1`,
            status_code: 301
          }
        }
      ],
      priority: rule.priority,
      status: 'active'
    }

    const createResponse = await axios.post(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/pagerules`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!createResponse.data?.success) {
      throw new Error(
        createResponse.data?.errors?.[0]?.message ||
        `Cloudflare returned an error while creating redirect rule`
      )
    }
  }

  console.log(`✅ Master domain redirect configured for ${domainName}`)
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Admin only
    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    if (!CLOUDFLARE_TOKEN) {
      return NextResponse.json({ 
        error: "Cloudflare API token not configured" 
      }, { status: 500 })
    }

    const { serverId, domainIds, masterDomain: rawMasterDomain } = await request.json()

    // Normalize master domain - strip protocol and trailing slashes
    let masterDomain: string | undefined
    if (rawMasterDomain && typeof rawMasterDomain === 'string') {
      masterDomain = rawMasterDomain
        .trim()
        .replace(/^https?:\/\//i, '')  // Remove http:// or https://
        .replace(/\/+$/, '')            // Remove trailing slashes
      if (!masterDomain) masterDomain = undefined
    }

    if (!serverId) {
      return NextResponse.json({ error: "Server ID is required" }, { status: 400 })
    }

    // Get server
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

    // Get domains to reset
    const whereClause: any = { serverId: server.id }
    if (domainIds && Array.isArray(domainIds) && domainIds.length > 0) {
      whereClause.id = { in: domainIds }
    }

    const domains = await prisma.domain.findMany({
      where: whereClause
    })

    if (domains.length === 0) {
      return NextResponse.json({ 
        error: "No domains found to reset" 
      }, { status: 404 })
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log(`ADMIN DNS RESET: ${domains.length} domain(s) for server ${server.serverName || server.id}`)
    console.log('='.repeat(60))

    const results = []

    for (const domain of domains) {
      if (!domain.cloudflareZoneId) {
        results.push({
          domain: domain.domainName,
          success: false,
          error: "No Cloudflare zone ID"
        })
        continue
      }

      try {
        const result = await resetDnsForDomain(
          domain.domainName,
          domain.cloudflareZoneId,
          server.id
        )

        // If master domain is provided, set up redirect
        let redirectConfigured = false
        if (masterDomain) {
          try {
            await configureMasterDomainRedirect(
              domain.domainName,
              domain.cloudflareZoneId,
              masterDomain
            )
            
            // Update database with master domain info
            await prisma.domain.update({
              where: {
                domainName_serverId: {
                  domainName: domain.domainName,
                  serverId: server.id
                }
              },
              data: {
                masterDomain: masterDomain,
                redirectConfigured: true,
                updatedAt: new Date()
              }
            })
            redirectConfigured = true
            console.log(`✅ Master domain redirect configured for ${domain.domainName}`)
          } catch (redirectError: any) {
            console.error(`⚠️ Failed to configure redirect for ${domain.domainName}:`, redirectError.message)
          }
        }

        results.push({
          ...result,
          success: true,
          redirectConfigured
        })
      } catch (error: any) {
        console.error(`❌ Failed to reset DNS for ${domain.domainName}:`, error.message)
        results.push({
          domain: domain.domainName,
          success: false,
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const redirectCount = results.filter((r: any) => r.redirectConfigured).length

    console.log(`\n${'='.repeat(60)}`)
    console.log(`DNS RESET COMPLETE: ${successCount}/${domains.length} domains successful`)
    if (masterDomain) {
      console.log(`REDIRECTS CONFIGURED: ${redirectCount}/${successCount} domains`)
    }
    console.log('='.repeat(60))

    return NextResponse.json({
      success: successCount > 0,
      total: domains.length,
      successful: successCount,
      failed: domains.length - successCount,
      results
    })

  } catch (error: any) {
    console.error("Error resetting DNS:", error)
    return NextResponse.json({ 
      error: "Failed to reset DNS", 
      message: error.message 
    }, { status: 500 })
  }
}
