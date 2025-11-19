import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import axios from "axios"

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"
const CLOUDFLARE_TOKEN = process.env.CLOUDFLARE_API_TOKEN

type PageRule = {
  id: string
  targets?: Array<{
    target: string
    constraint: {
      operator: string
      value: string
    }
  }>
}

type RedirectResult = {
  domain: string
  success: boolean
  status: "configured" | "skipped" | "error"
  message: string
}

const cloudflareHeaders = () => ({
  Authorization: `Bearer ${CLOUDFLARE_TOKEN}`,
  "Content-Type": "application/json",
})

async function listPageRules(zoneId: string): Promise<PageRule[]> {
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

async function deletePageRule(zoneId: string, ruleId: string): Promise<boolean> {
  try {
    const response = await axios.delete(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/pagerules/${ruleId}`,
      { headers: cloudflareHeaders() }
    )

    return Boolean(response.data?.success)
  } catch (error) {
    console.error(`Failed to delete page rule ${ruleId} for zone ${zoneId}:`, error)
    return false
  }
}

async function deleteAllPageRules(zoneId: string) {
  const pageRules = await listPageRules(zoneId)

  if (!pageRules.length) {
    return
  }

  for (const rule of pageRules) {
    if (rule.id) {
      await deletePageRule(zoneId, rule.id)
    }
  }
}

async function createPageRule(
  zoneId: string,
  sourcePattern: string,
  targetUrl: string,
  priority: number
) {
  const payload = {
    targets: [
      {
        target: "url",
        constraint: {
          operator: "matches",
          value: sourcePattern,
        },
      },
    ],
    actions: [
      {
        id: "forwarding_url",
        value: {
          url: targetUrl,
          status_code: 301,
        },
      },
    ],
    priority,
    status: "active",
  }

  const response = await axios.post(
    `${CLOUDFLARE_API_BASE}/zones/${zoneId}/pagerules`,
    payload,
    { headers: cloudflareHeaders() }
  )

  if (!response.data?.success) {
    throw new Error(
      response.data?.errors?.[0]?.message ||
        `Cloudflare returned an error while creating page rule`
    )
  }
}

async function configureRedirectForDomain(
  domain: string,
  zoneId: string,
  masterDomain: string
) {
  await deleteAllPageRules(zoneId)

  const rules = [
    {
      source: `${domain}/*`,
      priority: 1,
    },
    {
      source: `www.${domain}/*`,
      priority: 2,
    },
  ]

  for (const rule of rules) {
    await createPageRule(zoneId, rule.source, `https://${masterDomain}/$1`, rule.priority)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!CLOUDFLARE_TOKEN) {
      return NextResponse.json(
        { error: "Cloudflare API token not configured" },
        { status: 500 }
      )
    }

    const { serverId, domainNames, masterDomain } = await request.json()

    if (!serverId || !masterDomain) {
      return NextResponse.json(
        { error: "Server ID and masterDomain are required" },
        { status: 400 }
      )
    }

    const trimmedMasterDomain = String(masterDomain).trim().toLowerCase()

    if (!trimmedMasterDomain) {
      return NextResponse.json(
        { error: "Master domain must be provided" },
        { status: 400 }
      )
    }

    let server = await prisma.server.findUnique({
      where: { id: serverId },
    })

    if (!server) {
      server = await prisma.server.findFirst({
        where: { subscriptionId: serverId },
      })
    }

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    if (server.organizationId !== orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const requestedDomains: string[] | undefined =
      Array.isArray(domainNames) && domainNames.length > 0
        ? domainNames
            .map((domain: string) => domain.trim().toLowerCase())
            .filter(Boolean)
        : undefined

    const dbDomains = await prisma.domain.findMany({
      where: {
        serverId: server.id,
        ...(requestedDomains
          ? {
              domainName: {
                in: requestedDomains,
              },
            }
          : {}),
      },
    })

    if (!dbDomains.length) {
      return NextResponse.json(
        { error: "No matching domains found for this server" },
        { status: 404 }
      )
    }

    const results: RedirectResult[] = []

    for (const domain of dbDomains) {
      const domainName = domain.domainName

      if (!domainName) {
        continue
      }

      if (domainName.toLowerCase() === trimmedMasterDomain) {
        results.push({
          domain: domainName,
          success: false,
          status: "skipped",
          message: "Skipped master domain",
        })
        continue
      }

      // Only apply redirects once nameservers are fully active
      if (domain.cloudflareStatus !== "active") {
        results.push({
          domain: domainName,
          success: false,
          status: "skipped",
          message: "Skipped – nameservers not active yet",
        })
        continue
      }

      if (!domain.cloudflareZoneId) {
        results.push({
          domain: domainName,
          success: false,
          status: "error",
          message: "Missing Cloudflare zone ID for domain",
        })
        continue
      }

      try {
        await configureRedirectForDomain(
          domainName,
          domain.cloudflareZoneId,
          trimmedMasterDomain
        )

        results.push({
          domain: domainName,
          success: true,
          status: "configured",
          message: `Redirected to ${trimmedMasterDomain}`,
        })
      } catch (error: any) {
        console.error(`Failed to configure redirect for ${domainName}:`, error)
        results.push({
          domain: domainName,
          success: false,
          status: "error",
          message: error?.message || "Failed to configure redirect",
        })
      }
    }

    const configuredCount = results.filter((result) => result.status === "configured").length

    return NextResponse.json({
      success: configuredCount > 0,
      masterDomain: trimmedMasterDomain,
      processed: results.length,
      configured: configuredCount,
      results,
    })
  } catch (error: any) {
    console.error("Error configuring master domain redirects:", error)
    return NextResponse.json(
      {
        error: "Failed to configure master domain redirects",
        message: error?.message,
      },
      { status: 500 }
    )
  }
}

