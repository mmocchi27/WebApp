import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import axios from "axios"
import crypto from "crypto"
import bcrypt from "bcrypt"
import https from "https"
import { encryptSecret } from "@/lib/encryption"

interface InboxPayload {
  domainName: string
  username: string
  firstName: string
  lastName: string
}

const MAX_INBOXES_PER_DOMAIN = 5
const MAX_INBOXES_PER_SERVER = 102

function generatePassword(length = 16) {
  return crypto.randomBytes(length).toString("base64url").slice(0, length)
}

async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { serverId, inboxes }: { serverId: string; inboxes: InboxPayload[] } = body

    if (!serverId || !Array.isArray(inboxes) || inboxes.length === 0) {
      return NextResponse.json(
        { error: "Server ID and inbox payload are required" },
        { status: 400 }
      )
    }

    let server = await prisma.server.findUnique({ where: { id: serverId } })
    if (!server) {
      server = await prisma.server.findFirst({ where: { subscriptionId: serverId } })
    }
    if (!server || server.organizationId !== orgId) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }
    if (!server.ipAddress || !server.apiKey) {
      return NextResponse.json(
        { error: "Server is missing Mailcow credentials" },
        { status: 400 }
      )
    }

    const normalizedInboxes = inboxes.map((inbox) => ({
      domainName: inbox.domainName.trim().toLowerCase(),
      username: inbox.username.trim(),
      firstName: inbox.firstName.trim(),
      lastName: inbox.lastName.trim(),
    }))

    const currentServerInboxCount = await prisma.inbox.count({
      where: {
        serverId: server.id,
        status: { not: "failed" },
      },
    })

    if (currentServerInboxCount + normalizedInboxes.length > MAX_INBOXES_PER_SERVER) {
      return NextResponse.json(
        {
          error: "Server inbox limit reached",
          message: `This server can host up to ${MAX_INBOXES_PER_SERVER} inboxes. Please purchase another server to create more inboxes.`,
        },
        { status: 400 }
      )
    }

    const requestedPerDomain = normalizedInboxes.reduce<Map<string, number>>((acc, inbox) => {
      const current = acc.get(inbox.domainName) ?? 0
      acc.set(inbox.domainName, current + 1)
      return acc
    }, new Map())

    if (requestedPerDomain.size > 0) {
      const domainKeys = Array.from(requestedPerDomain.keys())
      const existingCounts = await prisma.inbox.groupBy({
        by: ["domainName"],
        where: {
          serverId: server.id,
          domainName: { in: domainKeys },
          status: { not: "failed" },
        },
        _count: { domainName: true },
      })

      const existingMap = new Map<string, number>()
      existingCounts.forEach((entry) => {
        if (entry.domainName) {
          existingMap.set(entry.domainName.toLowerCase(), entry._count.domainName)
        }
      })

      for (const domain of domainKeys) {
        const existing = existingMap.get(domain) ?? 0
        const incoming = requestedPerDomain.get(domain) ?? 0
        if (existing + incoming > MAX_INBOXES_PER_DOMAIN) {
          return NextResponse.json(
            {
              error: "Inbox limit reached",
              message: `Inbox limit for ${domain} has been reached`,
            },
            { status: 400 }
          )
        }
      }
    }

    const results: Array<{
      domain: string
      email: string
      status: "success" | "error"
      message?: string
      password?: string
    }> = []

    for (const inbox of normalizedInboxes) {
      const password = generatePassword(16)
      const passwordHash = await hashPassword(password)
      const email = `${inbox.username}@${inbox.domainName}`

      const existingInbox = await prisma.inbox.findUnique({ where: { email } })
      if (existingInbox) {
        return NextResponse.json(
          {
            error: "Duplicate inbox found. Please adjust the inboxes you're looking to create",
          },
          { status: 400 }
        )
      }

      let encryptedPassword: string
      try {
        encryptedPassword = encryptSecret(password)
      } catch (error: any) {
        console.error("Failed to encrypt inbox password:", error)
        return NextResponse.json(
          { error: "Failed to encrypt mailbox password" },
          { status: 500 }
        )
      }

      const createdInbox = await prisma.inbox.create({
        data: {
          serverId: server.id,
          domainName: inbox.domainName,
          localPart: inbox.username,
          email,
          firstName: inbox.firstName,
          lastName: inbox.lastName,
          fullName: `${inbox.firstName} ${inbox.lastName}`.trim(),
          passwordHash,
          encryptedPassword,
          status: "pending",
          createdBy: userId,
        },
      })

      try {
        const payload = {
          local_part: inbox.username,
          domain: inbox.domainName,
          password,
          password2: password,
          quota: "500",
          active: "1",
          name: `${inbox.firstName} ${inbox.lastName}`.trim(),
          authsource: "mailcow",
          force_pw_update: "1",
          tls_enforce_in: "1",
          tls_enforce_out: "0",
        }

        const response = await axios.post(
          `https://${server.ipAddress}/api/v1/add/mailbox`,
          payload,
          {
            headers: {
              "X-API-Key": server.apiKey,
              "Content-Type": "application/json",
            },
            timeout: 30000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          }
        )

        await prisma.inbox.update({
          where: { id: createdInbox.id },
          data: {
            status: "active",
            mailcowId: Array.isArray(response.data)
              ? response.data[0]?.id || null
              : null,
            lastSyncAt: new Date(),
          },
        })

        results.push({
          domain: inbox.domainName,
          email,
          status: "success",
          password,
        })
      } catch (error: any) {
        const message =
          error.response?.data?.error ||
          error.message ||
          "Failed to create mailbox"

        await prisma.inbox.update({
          where: { id: createdInbox.id },
          data: {
            status: "failed",
            lastSyncAt: new Date(),
          },
        })

        results.push({
          domain: inbox.domainName,
          email,
          status: "error",
          message,
        })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    console.error("Error creating inboxes:", error)
    return NextResponse.json(
      { error: "Failed to create inboxes", message: error.message },
      { status: 500 }
    )
  }
}

