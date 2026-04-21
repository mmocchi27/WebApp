import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import axios from "axios"

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"
const CLOUDFLARE_TOKEN = process.env.CLOUDFLARE_API_TOKEN

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

const cloudflareHeaders = () => ({
  Authorization: `Bearer ${CLOUDFLARE_TOKEN}`,
  "Content-Type": "application/json",
})

async function listPageRules(zoneId: string) {
  try {
    const response = await axios.get(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/pagerules`,
      { headers: cloudflareHeaders() }
    )
    if (response.data?.success) {
      return response.data.result || []
    }
  } catch (error) {
    console.error(`Failed to list page rules for zone ${zoneId}:`, error)
  }
  return []
}

async function deleteAllPageRules(zoneId: string) {
  const pageRules = await listPageRules(zoneId)
  for (const rule of pageRules) {
    if (rule.id) {
      try {
        await axios.delete(
          `${CLOUDFLARE_API_BASE}/zones/${zoneId}/pagerules/${rule.id}`,
          { headers: cloudflareHeaders() }
        )
      } catch (error) {
        console.error(`Failed to delete page rule ${rule.id}:`, error)
      }
    }
  }
}

async function createPageRule(zoneId: string, sourcePattern: string, targetUrl: string, priority: number) {
  const response = await axios.post(
    `${CLOUDFLARE_API_BASE}/zones/${zoneId}/pagerules`,
    {
      targets: [{ target: "url", constraint: { operator: "matches", value: sourcePattern } }],
      actions: [{ id: "forwarding_url", value: { url: targetUrl, status_code: 301 } }],
      priority,
      status: "active",
    },
    { headers: cloudflareHeaders() }
  )
  if (!response.data?.success) {
    throw new Error(response.data?.errors?.[0]?.message || "Cloudflare page rule creation failed")
  }
}

type RedirectResult = {
  domain: string
  success: boolean
  status: "configured" | "skipped" | "error"
  message: string
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const { serverId, masterDomain, domainNames } = await request.json()

    if (!serverId || !masterDomain) {
      return NextResponse.json({ error: "Server ID and masterDomain are required" }, { status: 400 })
    }

    const trimmedMasterDomain = String(masterDomain).trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/+$/, '')

    if (!trimmedMasterDomain) {
      return NextResponse.json({ error: "Master domain must be provided" }, { status: 400 })
    }

    const server = await prisma.server.findUnique({ where: { id: serverId } })
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    // Build where clause for domains
    const normalizedNames = Array.isArray(domainNames) && domainNames.length > 0
      ? domainNames.map((d: string) => d.trim().toLowerCase()).filter(Boolean)
      : null

    const domainWhereClause: any = { serverId: server.id }
    if (normalizedNames) {
      domainWhereClause.domainName = { in: normalizedNames }
    }

    // Step 1: Save master domain to DB
    const updateResult = await prisma.domain.updateMany({
      where: domainWhereClause,
      data: { masterDomain: trimmedMasterDomain },
    })

    // Step 2: Configure Cloudflare redirects
    if (!CLOUDFLARE_TOKEN) {
      return NextResponse.json({
        success: true,
        updated: updateResult.count,
        masterDomain: trimmedMasterDomain,
        redirects: { error: "Cloudflare API token not configured - DB updated but redirects not configured" },
      })
    }

    const dbDomains = await prisma.domain.findMany({ where: domainWhereClause })
    const results: RedirectResult[] = []

    for (const domain of dbDomains) {
      if (!domain.domainName) continue

      if (domain.domainName.toLowerCase() === trimmedMasterDomain) {
        results.push({ domain: domain.domainName, success: false, status: "skipped", message: "Skipped master domain itself" })
        continue
      }

      if (domain.cloudflareStatus !== "active") {
        results.push({ domain: domain.domainName, success: false, status: "skipped", message: "Nameservers not active yet" })
        continue
      }

      if (!domain.cloudflareZoneId) {
        results.push({ domain: domain.domainName, success: false, status: "error", message: "Missing Cloudflare zone ID" })
        continue
      }

      try {
        await deleteAllPageRules(domain.cloudflareZoneId)
        await createPageRule(domain.cloudflareZoneId, `${domain.domainName}/*`, `https://${trimmedMasterDomain}/$1`, 1)
        await createPageRule(domain.cloudflareZoneId, `www.${domain.domainName}/*`, `https://${trimmedMasterDomain}/$1`, 2)

        await prisma.domain.update({
          where: { id: domain.id },
          data: { redirectConfigured: true },
        })

        results.push({ domain: domain.domainName, success: true, status: "configured", message: `Redirected to ${trimmedMasterDomain}` })
      } catch (error: any) {
        console.error(`Failed to configure redirect for ${domain.domainName}:`, error)
        results.push({ domain: domain.domainName, success: false, status: "error", message: error?.message || "Failed to configure redirect" })
      }
    }

    const configuredCount = results.filter(r => r.status === "configured").length

    return NextResponse.json({
      success: true,
      updated: updateResult.count,
      masterDomain: trimmedMasterDomain,
      redirects: {
        processed: results.length,
        configured: configuredCount,
        results,
      },
    })
  } catch (error: any) {
    console.error("Error in admin master-domain:", error)
    return NextResponse.json({ error: "Failed to configure master domain", message: error?.message }, { status: 500 })
  }
}
