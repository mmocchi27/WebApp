import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import axios from "axios"

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

// Cloudflare API token from environment
const CLOUDFLARE_TOKEN = process.env.CLOUDFLARE_API_TOKEN

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!CLOUDFLARE_TOKEN) {
      return NextResponse.json({ 
        error: "Cloudflare API token not configured",
        message: "Please configure CLOUDFLARE_API_TOKEN in environment variables"
      }, { status: 500 })
    }

    const { domains, serverId } = await request.json()
    
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json({ error: "Domains array is required" }, { status: 400 })
    }

    if (!serverId) {
      return NextResponse.json({ error: "Server ID is required" }, { status: 400 })
    }

    // Verify user has access to this server (prefer UUID, fallback to subscription ID)
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

    if (server.organizationId !== orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    console.log(`Checking DNS for ${domains.length} domains...`)

    // Check DNS records for each domain
    const records: {[domain: string]: any} = {}

    for (const domain of domains) {
      try {
        // Get Cloudflare zone ID for this domain
        const zoneId = await getCloudflareZoneId(domain)
        
        if (!zoneId) {
          records[domain] = {
            mx: false,
            spf: false,
            dmarc: false,
            dkim: false,
            ns: false,
            nameservers: [],
            cloudflareStatus: null,
            error: "Domain not found in Cloudflare"
          }
          continue
        }

        // Check each DNS record type
        const [mx, spf, dmarc, dkim, nsData] = await Promise.all([
          checkMXRecord(zoneId, domain),
          checkSPFRecord(zoneId, domain),
          checkDMARCRecord(zoneId, domain),
          checkDKIMRecord(zoneId, domain),
          getNameservers(zoneId)
        ])

        records[domain] = { 
          mx, 
          spf, 
          dmarc, 
          dkim, 
          ns: nsData.nameservers.length > 0,
          nameservers: nsData.nameservers,
          cloudflareStatus: nsData.status
        }
        
      } catch (error: any) {
        console.error(`Error checking DNS for ${domain}:`, error.message)
        records[domain] = {
          mx: false,
          spf: false,
          dmarc: false,
          dkim: false,
          ns: false,
          nameservers: [],
          cloudflareStatus: null,
          error: error.message
        }
      }
    }

    console.log(`DNS check complete for ${domains.length} domains`)

    return NextResponse.json({ 
      success: true, 
      records 
    })

  } catch (error: any) {
    console.error("Error checking DNS records:", error)
    return NextResponse.json({ 
      error: "Failed to check DNS records", 
      message: error.message 
    }, { status: 500 })
  }
}

// Helper function to get Cloudflare zone ID
async function getCloudflareZoneId(domain: string): Promise<string | null> {
  try {
    const response = await axios.get(`${CLOUDFLARE_API_BASE}/zones`, {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        name: domain
      }
    })

    if (response.data.success && response.data.result.length > 0) {
      return response.data.result[0].id
    }
    
    return null
  } catch (error) {
    console.error(`Error getting zone ID for ${domain}:`, error)
    return null
  }
}

// Check MX record
async function checkMXRecord(zoneId: string, domain: string): Promise<boolean> {
  try {
    const response = await axios.get(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`, {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        type: 'MX',
        name: domain
      }
    })

    return response.data.success && response.data.result.length > 0
  } catch (error) {
    return false
  }
}

// Check SPF record (TXT record containing v=spf1)
async function checkSPFRecord(zoneId: string, domain: string): Promise<boolean> {
  try {
    const response = await axios.get(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`, {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        type: 'TXT',
        name: domain
      }
    })

    if (response.data.success && response.data.result.length > 0) {
      // Check if any TXT record contains SPF
      return response.data.result.some((record: any) => 
        record.content && record.content.includes('v=spf1')
      )
    }
    
    return false
  } catch (error) {
    return false
  }
}

// Check DMARC record (TXT record at _dmarc subdomain)
async function checkDMARCRecord(zoneId: string, domain: string): Promise<boolean> {
  try {
    const response = await axios.get(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`, {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        type: 'TXT',
        name: `_dmarc.${domain}`
      }
    })

    if (response.data.success && response.data.result.length > 0) {
      // Check if any TXT record contains DMARC
      return response.data.result.some((record: any) => 
        record.content && record.content.includes('v=DMARC1')
      )
    }
    
    return false
  } catch (error) {
    return false
  }
}

// Check DKIM record (TXT record at dkim._domainkey subdomain)
async function checkDKIMRecord(zoneId: string, domain: string): Promise<boolean> {
  try {
    const response = await axios.get(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`, {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        type: 'TXT',
        name: `dkim._domainkey.${domain}`
      }
    })

    return response.data.success && response.data.result.length > 0
  } catch (error) {
    return false
  }
}

// Get nameservers and zone status from zone details
async function getNameservers(zoneId: string): Promise<{ nameservers: string[], status: string | null }> {
  try {
    const response = await axios.get(`${CLOUDFLARE_API_BASE}/zones/${zoneId}`, {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.data.success && response.data.result) {
      return { 
        nameservers: response.data.result.name_servers || [],
        status: response.data.result.status || null
      }
    }
    
    return { nameservers: [], status: null }
  } catch (error) {
    console.error('Error fetching nameservers:', error)
    return { nameservers: [], status: null }
  }
}

