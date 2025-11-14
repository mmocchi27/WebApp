import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import axios from "axios"
import https from "https"

// Create axios instance that allows self-signed certificates
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // Allow self-signed certificates
  })
})

export async function GET(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get serverId from query params (this is actually the subscription ID)
    const serverId = request.nextUrl.searchParams.get("serverId")
    if (!serverId) {
      return NextResponse.json({ error: "Server ID is required" }, { status: 400 })
    }

    // Get server details from database by subscription ID
    const server = await prisma.server.findFirst({
      where: { subscriptionId: serverId }
    })

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    // Verify user has access to this server's organization
    if (server.organizationId !== orgId) {
      return NextResponse.json({ error: "Forbidden - You don't have access to this server" }, { status: 403 })
    }

    // Fetch domains from database
    console.log(`Fetching domains from database for server ${server.id}...`)
    
    const dbDomains = await prisma.domain.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: 'desc' }
    })

    // Transform to match the expected frontend format
    const domains = dbDomains.map(domain => ({
      id: domain.id,
      domain_name: domain.domainName,
      active: domain.cloudflareStatus === 'active' ? 1 : 0,
      cloudflareStatus: domain.cloudflareStatus,
      cloudflareZoneId: domain.cloudflareZoneId,
      nameservers: domain.nameservers || [],
      dnsConfigured: domain.dnsConfigured,
      masterDomain: domain.masterDomain,
      redirectConfigured: domain.redirectConfigured,
      mxRecord: domain.mxRecord,
      spfRecord: domain.spfRecord,
      dmarcRecord: domain.dmarcRecord,
      dkimRecord: domain.dkimRecord,
      lastCheckedAt: domain.lastCheckedAt
    }))

    console.log(`Successfully fetched ${domains.length} domains from database`)

    return NextResponse.json({ 
      success: true, 
      domains,
      serverName: server.serverName,
      serverIp: server.ipAddress
    })

  } catch (error: any) {
    console.error("Error fetching domains from MailCow:", error)
    
    // Provide detailed error messages
    if (error.code === 'ECONNREFUSED') {
      return NextResponse.json({ 
        error: "Connection refused", 
        message: "Could not connect to MailCow server. The server may be down or the IP address is incorrect."
      }, { status: 503 })
    } else if (error.code === 'ETIMEDOUT') {
      return NextResponse.json({ 
        error: "Connection timeout", 
        message: "Connection to MailCow server timed out. The server may be slow or unreachable."
      }, { status: 504 })
    } else if (error.response) {
      // MailCow API returned an error
      return NextResponse.json({ 
        error: "MailCow API error", 
        message: `MailCow returned status ${error.response.status}. Please check API key and server configuration.`,
        details: error.response.data
      }, { status: error.response.status })
    } else {
      return NextResponse.json({ 
        error: "Failed to fetch domains", 
        message: error.message 
      }, { status: 500 })
    }
  }
}

