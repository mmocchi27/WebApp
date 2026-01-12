import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/encryption"

// #region agent log
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress
    const adminEmail = process.env.ADMIN_EMAIL || 'mitch@mailmountains.com'
    console.log(`[DEBUG-EXPORT-ADMIN] Checking admin: userEmail=${userEmail}, adminEmail=${adminEmail}, isAdmin=${userEmail === adminEmail}`);
    return userEmail === adminEmail
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}
// #endregion

type ExportDestination = "Instantly" | "Smartlead"

interface ExportRequestBody {
  serverId: string
  destination: ExportDestination
}

type ExportRow = {
  email: string
  firstName: string
  lastName: string
  domain: string
  password: string
}

function generateInstantlyCsv(inboxes: ExportRow[]) {
  const header =
    "Email,First Name,Last Name,IMAP Username,IMAP Password,IMAP Host,IMAP Port,SMTP Username,SMTP Password,SMTP Host,SMTP Port\n"
  const rows = inboxes
    .map(({ email, firstName, lastName, domain, password }) => {
      const host = `mail.${domain}`
      return `${email},${firstName},${lastName},${email},${password},${host},993,${email},${password},${host},465`
    })
    .join("\n")
  return header + rows
}

function generateSmartleadCsv(inboxes: ExportRow[]) {
  const header =
    "from_name,from_email,user_name,password,smtp_host,smtp_port,imap_host,imap_port\n"
  const rows = inboxes
    .map(({ email, firstName, lastName, domain, password }) => {
      const fullName = `${firstName} ${lastName}`.trim() || email
      const host = `mail.${domain}`
      return `${fullName},${email},${email},${password},${host},465,${host},993`
    })
    .join("\n")
  return header + rows
}

export async function POST(request: NextRequest) {
  // #region agent log
  console.log(`[DEBUG-EXPORT-C] POST handler ENTRY: url=${request.url}, method=${request.method}`);
  // #endregion
  try {
    const { userId, orgId } = await auth()
    // #region agent log
    console.log(`[DEBUG-EXPORT-B] Auth result: userId=${userId||'null'}, orgId=${orgId||'null'}`);
    // #endregion
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json()) as ExportRequestBody
    const { serverId, destination } = body
    // #region agent log
    console.log(`[DEBUG-EXPORT-E] Request body: serverId=${serverId}, destination=${destination}`);
    // #endregion

    if (!serverId || !destination) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (!["Instantly", "Smartlead"].includes(destination)) {
      return NextResponse.json({ error: "Invalid destination" }, { status: 400 })
    }

    let server = await prisma.server.findUnique({ where: { id: serverId } })
    if (!server) {
      server = await prisma.server.findFirst({ where: { subscriptionId: serverId } })
    }

    // #region agent log
    const userIsAdmin = await isAdmin(userId)
    console.log(`[DEBUG-EXPORT-D] Server check: serverFound=${!!server}, serverOrgId=${server?.organizationId||'null'}, requestOrgId=${orgId||'null'}, userIsAdmin=${userIsAdmin}`);
    // #endregion
    
    // Allow access if: server exists AND (org matches OR user is admin)
    if (!server || (server.organizationId !== orgId && !userIsAdmin)) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

    const inboxes = await prisma.inbox.findMany({
      where: {
        serverId: server.id,
        status: "active",
      },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        domainName: true,
        encryptedPassword: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    if (inboxes.length === 0) {
      return NextResponse.json(
        { error: "No active inboxes to export" },
        { status: 400 }
      )
    }

    const payload: ExportRow[] = []
    for (const inbox of inboxes) {
      if (!inbox.encryptedPassword) {
        return NextResponse.json(
          {
            error: "Missing password",
            message:
              "One or more inboxes were created before password encryption was enabled. Please recreate those inboxes to export.",
          },
          { status: 400 }
        )
      }

      let decryptedPassword: string
      try {
        decryptedPassword = decryptSecret(inbox.encryptedPassword)
      } catch (error: any) {
        console.error("Failed to decrypt inbox password:", error)
        return NextResponse.json(
          { error: "Failed to decrypt inbox password" },
          { status: 500 }
        )
      }

      payload.push({
        email: inbox.email,
        firstName: inbox.firstName || "",
        lastName: inbox.lastName || "",
        domain: inbox.domainName || "",
        password: decryptedPassword,
      })
    }

    const csv =
      destination === "Instantly"
        ? generateInstantlyCsv(payload)
        : generateSmartleadCsv(payload)

    const fileName = `inboxes-${destination.toLowerCase()}-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv`

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    })
  } catch (error: any) {
    console.error("Error exporting inboxes:", error)
    return NextResponse.json(
      { error: "Failed to export inboxes", message: error.message },
      { status: 500 }
    )
  }
}

