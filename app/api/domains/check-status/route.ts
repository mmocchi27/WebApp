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

async function configureDnsForDomain(domain: string, zoneId: string, serverId: string) {
  try {
    console.log(`📝 Starting DNS configuration for ${domain}...`)

    // Get server details to get hostname
    const server = await prisma.server.findUnique({
      where: { id: serverId }
    })

    if (!server || !server.hostname || !server.ipAddress || !server.apiKey) {
      throw new Error('Server not found or missing required fields (hostname, IP, API key)')
    }

    const hostname = server.hostname
    const smtpIp = server.ipAddress
    const apiKey = server.apiKey

    console.log(`  Using hostname: ${hostname}`)

    // Step 1: Clear all existing DNS records in Cloudflare
    console.log(`  🗑️ Clearing existing DNS records...`)
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
          console.log(`    ✅ Deleted ${record.type} record: ${record.name}`)
        } catch (error) {
          console.log(`    ⚠️ Failed to delete ${record.type} record: ${record.name}`)
        }
      }
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
        } else {
          console.log(`    ❌ Failed to create ${record.type} record: ${record.name}`)
        }
      } catch (error: any) {
        console.log(`    ❌ Error creating ${record.type} record: ${record.name} - ${error.message}`)
      }
    }

    // Step 4: Store DNS records in database
    console.log(`  💾 Storing DNS records in database...`)
    await prisma.domain.update({
      where: {
        domainName_serverId: {
          domainName: domain,
          serverId: serverId
        }
      },
      data: {
        dnsConfigured: true,
        mxRecord: mxRecord,
        spfRecord: spfRecord,
        dmarcRecord: dmarcRecord,
        dkimRecord: dkimKey || null,
        updatedAt: new Date()
      }
    })

    console.log(`✅ DNS configuration completed for ${domain}`)
    return true

  } catch (error: any) {
    console.error(`❌ Error configuring DNS for ${domain}:`, error.message)
    throw error
  }
}

async function configureMasterDomainRedirect(
  domain: string,
  zoneId: string,
  masterDomain: string
) {
  try {
    console.log(`🌐 Setting up master domain redirect for ${domain} → ${masterDomain}`)

    // Step 1: Delete old Redirect Rules (newer system) - these take precedence
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
          // Look for redirect rulesets (phase: http_request_dynamic_redirect)
          if (ruleset.phase === 'http_request_dynamic_redirect' && ruleset.id) {
            try {
              // Delete the entire ruleset
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

    const rules = [
      { source: `${domain}/*`, priority: 1 },
      { source: `www.${domain}/*`, priority: 2 }
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

    console.log(`✅ Master domain redirect configured for ${domain}`)
  } catch (error: any) {
    console.error(`❌ Error configuring master domain redirect for ${domain}:`, error?.message)
    throw error
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

    const { serverId, domainId } = await request.json()
    
    if (!serverId) {
      return NextResponse.json({ error: "Server ID is required" }, { status: 400 })
    }

    // Get server details by UUID (preferred) or legacy Stripe subscription ID
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

    // Get domains for this server (optionally filter by domainId)
    const whereClause = domainId 
      ? { serverId: server.id, id: domainId }
      : { serverId: server.id }

    const domains = await prisma.domain.findMany({
      where: whereClause
    })

    if (domains.length === 0) {
      return NextResponse.json({ 
        message: "No domains found",
        updated: 0
      })
    }

    console.log(`Checking status for ${domains.length} domains...`)

    let updatedCount = 0
    const results = []

    // Check each domain's status in Cloudflare
    for (const domain of domains) {
      if (!domain.cloudflareZoneId) {
        console.log(`Skipping ${domain.domainName} - no zone ID`)
        results.push({
          domain: domain.domainName,
          status: domain.cloudflareStatus,
          updated: false,
          error: "No Cloudflare zone ID"
        })
        continue
      }

      try {
        // Get zone details from Cloudflare
        const response = await axios.get(
          `${CLOUDFLARE_API_BASE}/zones/${domain.cloudflareZoneId}`,
          {
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        )

        if (response.data.success && response.data.result) {
          const newStatus = response.data.result.status || 'pending'
          const nameservers = response.data.result.name_servers || []
          const oldStatus = domain.cloudflareStatus

          // Update domain status and nameservers in database
          await prisma.domain.update({
            where: { id: domain.id },
            data: {
              cloudflareStatus: newStatus,
              nameservers: nameservers,
              lastCheckedAt: new Date(),
              updatedAt: new Date()
            }
          })

          // Check if domain is active and hasn't had DNS configured yet
          if (newStatus === 'active' && !domain.dnsConfigured) {
            console.log(`🎯 Domain ${domain.domainName} is active and needs DNS configuration...`)
            
            // Trigger DNS configuration
            try {
              await configureDnsForDomain(domain.domainName, domain.cloudflareZoneId!, domain.serverId)
              console.log(`✅ DNS configuration completed for ${domain.domainName}`)
            } catch (error: any) {
              console.error(`❌ DNS configuration failed for ${domain.domainName}:`, error.message)
            }
          }

          // If a master domain is set, configure redirect once nameservers are active
          if (
            newStatus === 'active' &&
            domain.masterDomain &&
            !domain.redirectConfigured
          ) {
            try {
              await configureMasterDomainRedirect(
                domain.domainName,
                domain.cloudflareZoneId!,
                domain.masterDomain
              )

              await prisma.domain.update({
                where: { id: domain.id },
                data: {
                  redirectConfigured: true,
                  updatedAt: new Date()
                }
              })
            } catch (error: any) {
              console.error(
                `❌ Master domain redirect failed for ${domain.domainName}:`,
                error?.message
              )
            }
          }

          if (newStatus !== oldStatus) {
            updatedCount++
            console.log(`✓ ${domain.domainName}: ${oldStatus} → ${newStatus}`)
          } else {
            console.log(`  ${domain.domainName}: ${newStatus} (no change)`)
          }

          // Get updated domain data
          const updatedDomain = await prisma.domain.findUnique({
            where: { id: domain.id }
          })

          results.push({
            domain: domain.domainName,
            status: newStatus,
            updated: newStatus !== oldStatus,
            previousStatus: oldStatus,
            nameservers: updatedDomain?.nameservers || nameservers,
            dnsConfigured: updatedDomain?.dnsConfigured || false,
            mxRecord: updatedDomain?.mxRecord,
            spfRecord: updatedDomain?.spfRecord,
            dmarcRecord: updatedDomain?.dmarcRecord,
            dkimRecord: updatedDomain?.dkimRecord,
            redirectConfigured: updatedDomain?.redirectConfigured || false,
            masterDomain: updatedDomain?.masterDomain
          })
        }
      } catch (error: any) {
        console.error(`Error checking ${domain.domainName}:`, error.message)
        results.push({
          domain: domain.domainName,
          status: domain.cloudflareStatus,
          updated: false,
          error: error.message
        })
      }
    }

    console.log(`Status check complete. ${updatedCount} domains updated.`)

    return NextResponse.json({ 
      success: true,
      checked: domains.length,
      updated: updatedCount,
      results
    })

  } catch (error: any) {
    console.error("Error checking domain status:", error)
    return NextResponse.json({ 
      error: "Failed to check domain status", 
      message: error.message 
    }, { status: 500 })
  }
}

