import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import axios from "axios"
import https from "https"

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'
const CLOUDFLARE_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const MAX_DOMAINS_PER_SERVER = 34

// Create axios instance for MailCow that allows self-signed certificates
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
})

// Some upstream APIs occasionally return strings with null bytes, which Postgres rejects.
// This helper strips any \u0000 characters to keep inserts safe.
function sanitizeString(value: any): any {
  if (typeof value === "string") {
    return value.replace(/\u0000/g, "")
  }
  return value
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

    const { domain, serverId } = await request.json()
    
    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 })
    }

    if (!serverId) {
      return NextResponse.json({ error: "Server ID is required" }, { status: 400 })
    }

    // Get server details from database by UUID (preferred) or legacy subscription ID
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

    // Check if server has credentials
    if (!server.ipAddress || !server.apiKey) {
      return NextResponse.json({ 
        error: "Server not configured",
        message: "Server does not have IP address or API key configured" 
      }, { status: 400 })
    }

    const cleanDomain = sanitizeString(domain)

    // Inherit the most recently configured master domain for this server (if any)
    const existingMasterDomain = await prisma.domain.findFirst({
      where: {
        serverId: server.id,
        masterDomain: { not: null },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        masterDomain: true,
      },
    })

    const inheritedMasterDomain = existingMasterDomain?.masterDomain
      ? sanitizeString(existingMasterDomain.masterDomain)
      : null

    const existingDomain = await prisma.domain.findFirst({
      where: {
        serverId: server.id,
        domainName: cleanDomain,
      },
    })

    if (existingDomain) {
      return NextResponse.json(
        {
          error: "Duplicate domain",
          message: "This domain already exists on this server. Remove duplicates before proceeding.",
        },
        { status: 400 }
      )
    }

    const domainCount = await prisma.domain.count({
      where: { serverId: server.id },
    })

    if (domainCount >= MAX_DOMAINS_PER_SERVER) {
      return NextResponse.json(
        {
          error: "Domain limit reached",
          message: `Each server can have a maximum of ${MAX_DOMAINS_PER_SERVER} domains.`,
        },
        { status: 400 }
      )
    }

    console.log(`Adding domain ${cleanDomain} to Cloudflare and MailCow...`)

    // Step 1: Create zone in Cloudflare
    let nameservers: string[] = []
    let cloudflareStatus: string = 'pending'
    let cloudflareZoneId: string = ''
    try {
      const cfResponse = await axios.post(
        `${CLOUDFLARE_API_BASE}/zones`,
        {
          name: cleanDomain,
          jump_start: false // Set to true if you want Cloudflare to auto-detect DNS records
        },
        {
          headers: {
            'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (cfResponse.data.success && cfResponse.data.result) {
        nameservers = cfResponse.data.result.name_servers || []
        cloudflareStatus = cfResponse.data.result.status || 'pending'
        cloudflareZoneId = cfResponse.data.result.id || ''
        console.log(`✓ Created Cloudflare zone for ${cleanDomain}`)
        console.log(`  Zone ID: ${cloudflareZoneId}`)
        console.log(`  Nameservers: ${nameservers.join(', ')}`)
        console.log(`  Status: ${cloudflareStatus}`)
      } else {
        throw new Error('Failed to create Cloudflare zone')
      }
    } catch (error: any) {
      console.error(`Error creating Cloudflare zone for ${domain}:`, error.message)
      console.error('Full Cloudflare error:', JSON.stringify(error.response?.data, null, 2))
      
      // Check if zone already exists
      if (error.response?.data?.errors?.[0]?.code === 1061) {
        // Zone already exists, try to get its nameservers
        try {
          const zoneListResponse = await axios.get(
            `${CLOUDFLARE_API_BASE}/zones`,
            {
              headers: {
                'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`
              },
              params: {
                name: domain
              }
            }
          )
          
          if (zoneListResponse.data.success && zoneListResponse.data.result.length > 0) {
            nameservers = zoneListResponse.data.result[0].name_servers || []
            cloudflareStatus = zoneListResponse.data.result[0].status || 'pending'
            cloudflareZoneId = zoneListResponse.data.result[0].id || ''
            console.log(`✓ Zone already exists in Cloudflare for ${cleanDomain}`)
          }
        } catch (getError) {
          console.error('Error fetching existing zone:', getError)
        }
      }
      
      if (nameservers.length === 0) {
        return NextResponse.json({ 
          error: "Failed to create Cloudflare zone",
          message: error.response?.data?.errors?.[0]?.message || error.message
        }, { status: 500 })
      }
    }

    // Step 2: Add domain to MailCow
    const baseURL = `https://${server.ipAddress}`
    
    try {
      const mcResponse = await axiosInstance.post(
        `${baseURL}/api/v1/add/domain`,
        {
          domain: cleanDomain,
          active: 1
        },
        {
          headers: {
            'X-API-Key': server.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      )

      if (mcResponse.status === 200 || mcResponse.status === 201) {
        console.log(`✓ Added domain to MailCow: ${cleanDomain}`)
      } else {
        console.log(`⚠ MailCow response status: ${mcResponse.status}`)
      }
    } catch (error: any) {
      console.error(`Error adding domain to MailCow for ${cleanDomain}:`, error.message)
      
      // Even if MailCow fails, we still save to database since Cloudflare worked
      // Step 3: Save domain to database
      // Sanitize values before writing to Postgres
      const safeZoneId = sanitizeString(cloudflareZoneId) || ''
      const safeStatus = sanitizeString(cloudflareStatus) || 'pending'
      const safeNameservers = Array.isArray(nameservers)
        ? nameservers.filter(ns => ns && typeof ns === 'string').map(ns => sanitizeString(ns)).filter(Boolean)
        : []

      // DEBUG: Log all values to find null bytes
      console.log('=== DEBUG: Pre-upsert values (MailCow error path) ===')
      console.log('cleanDomain:', JSON.stringify(cleanDomain), 'has null:', /\u0000/.test(cleanDomain))
      console.log('server.id:', JSON.stringify(server.id), 'has null:', typeof server.id === 'string' && /\u0000/.test(server.id))
      console.log('safeZoneId:', JSON.stringify(safeZoneId), 'has null:', /\u0000/.test(safeZoneId))
      console.log('safeStatus:', JSON.stringify(safeStatus), 'has null:', /\u0000/.test(safeStatus))
      console.log('safeNameservers:', JSON.stringify(safeNameservers))
      safeNameservers.forEach((ns, i) => {
        console.log(`  NS[${i}]:`, JSON.stringify(ns), 'has null:', /\u0000/.test(ns))
      })
      console.log('================================')

      // First try to delete any existing record (in case it's corrupted)
      try {
        await prisma.domain.deleteMany({
          where: {
            domainName: cleanDomain,
            serverId: sanitizeString(server.id)
          }
        })
      } catch (deleteError) {
        console.log('Could not delete existing record (might not exist):', deleteError.message)
      }

      // Now create fresh - explicitly set ALL fields to avoid any auto-populated corruption
      await prisma.domain.create({
        data: {
          domainName: cleanDomain,
          serverId: sanitizeString(server.id),
          cloudflareZoneId: safeZoneId || null,
          cloudflareStatus: safeStatus,
          nameservers: safeNameservers.length > 0 ? safeNameservers : null,
          dnsConfigured: false,
          masterDomain: inheritedMasterDomain,
          redirectConfigured: false,
          mxRecord: null,
          spfRecord: null,
          dmarcRecord: null,
          dkimRecord: null,
          lastCheckedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
      
      console.log(`✓ Saved domain to database: ${cleanDomain}`)
      
      return NextResponse.json({ 
        success: true,
        nameservers: safeNameservers,
        cloudflareStatus: safeStatus,
        warning: "Domain added to Cloudflare but failed to add to MailCow: " + error.message
      })
    }

    // Step 3: Save domain to database
    // Sanitize values before writing to Postgres
    const safeZoneId = sanitizeString(cloudflareZoneId) || ''
    const safeStatus = sanitizeString(cloudflareStatus) || 'pending'
    const safeNameservers = Array.isArray(nameservers)
      ? nameservers.filter(ns => ns && typeof ns === 'string').map(ns => sanitizeString(ns)).filter(Boolean)
      : []

    // DEBUG: Log all values to find null bytes
    console.log('=== DEBUG: Pre-upsert values ===')
    console.log('cleanDomain:', JSON.stringify(cleanDomain), 'has null:', /\u0000/.test(cleanDomain))
    console.log('server.id:', JSON.stringify(server.id), 'has null:', typeof server.id === 'string' && /\u0000/.test(server.id))
    console.log('safeZoneId:', JSON.stringify(safeZoneId), 'has null:', /\u0000/.test(safeZoneId))
    console.log('safeStatus:', JSON.stringify(safeStatus), 'has null:', /\u0000/.test(safeStatus))
    console.log('safeNameservers:', JSON.stringify(safeNameservers))
    safeNameservers.forEach((ns, i) => {
      console.log(`  NS[${i}]:`, JSON.stringify(ns), 'has null:', /\u0000/.test(ns))
    })
    console.log('================================')

    // First try to delete any existing record (in case it's corrupted)
    try {
      await prisma.domain.deleteMany({
        where: {
          domainName: cleanDomain,
          serverId: sanitizeString(server.id)
        }
      })
    } catch (deleteError) {
      console.log('Could not delete existing record (might not exist):', deleteError.message)
    }

    // Now create fresh - explicitly set ALL fields to avoid any auto-populated corruption
    await prisma.domain.create({
      data: {
        domainName: cleanDomain,
        serverId: sanitizeString(server.id),
        cloudflareZoneId: safeZoneId || null,
        cloudflareStatus: safeStatus,
        nameservers: safeNameservers.length > 0 ? safeNameservers : null,
        dnsConfigured: false,
        masterDomain: inheritedMasterDomain,
        redirectConfigured: false,
        mxRecord: null,
        spfRecord: null,
        dmarcRecord: null,
        dkimRecord: null,
        lastCheckedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
    
    console.log(`✓ Saved domain to database: ${cleanDomain}`)

    return NextResponse.json({ 
      success: true,
      domain: cleanDomain,
      nameservers: safeNameservers,
      cloudflareStatus: safeStatus
    })

  } catch (error: any) {
    console.error("Error adding domain:", error)
    return NextResponse.json({ 
      error: "Failed to add domain", 
      message: error.message 
    }, { status: 500 })
  }
}

