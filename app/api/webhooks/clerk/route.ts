import { NextRequest, NextResponse } from "next/server"
import { Webhook } from "svix"
import { getSupabase } from "@/lib/supabase"

export async function POST(request: NextRequest) {
  console.log("[clerk-webhook] Received request")

  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not set")
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }
  console.log("[clerk-webhook] Webhook secret found")

  const svixId = request.headers.get("svix-id")
  const svixTimestamp = request.headers.get("svix-timestamp")
  const svixSignature = request.headers.get("svix-signature")

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("[clerk-webhook] Missing svix headers")
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 })
  }

  const body = await request.text()

  let event: any
  try {
    const wh = new Webhook(webhookSecret)
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    })
    console.log("[clerk-webhook] Signature verified, event type:", event.type)
  } catch (err) {
    console.error("[clerk-webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 })
  }

  const eventType: string = event.type
  const data = event.data

  try {
    console.log("[clerk-webhook] Supabase URL set:", !!process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log("[clerk-webhook] Supabase key set:", !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    switch (eventType) {
      // A user joined an organization
      case "organizationMembership.created": {
        const orgId: string = data.organization.id
        const orgName: string = data.organization.name
        const userId: string = data.public_user_data.user_id
        const email: string = data.public_user_data.identifier
        const firstName: string = data.public_user_data.first_name || ""
        const lastName: string = data.public_user_data.last_name || ""
        const role: string = data.role === "org:admin" ? "admin" : "member"

        await getSupabase().from("organizations").upsert(
          {
            organization_id: orgId,
            user_id: userId,
            organization_name: orgName,
            user_email: email,
            user_full_name: `${firstName} ${lastName}`.trim(),
            role,
          },
          { onConflict: "organization_id,user_id" }
        )
        break
      }

      // A member's role was changed
      case "organizationMembership.updated": {
        const orgId: string = data.organization.id
        const userId: string = data.public_user_data.user_id
        const role: string = data.role === "org:admin" ? "admin" : "member"

        await getSupabase()
          .from("organizations")
          .update({ role, updated_at: new Date().toISOString() })
          .eq("organization_id", orgId)
          .eq("user_id", userId)
        break
      }

      // A member left or was removed from an organization
      case "organizationMembership.deleted": {
        const orgId: string = data.organization.id
        const userId: string = data.public_user_data.user_id

        await getSupabase()
          .from("organizations")
          .delete()
          .eq("organization_id", orgId)
          .eq("user_id", userId)
        break
      }

      // Organization name changed
      case "organization.updated": {
        const orgId: string = data.id
        const orgName: string = data.name

        await getSupabase()
          .from("organizations")
          .update({ organization_name: orgName, updated_at: new Date().toISOString() })
          .eq("organization_id", orgId)
        break
      }

      // User signed in — update last_sign_in_at for all their org rows
      case "session.created": {
        const userId: string = data.user_id

        await getSupabase()
          .from("organizations")
          .update({ last_sign_in_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("user_id", userId)
        break
      }

      // User updated their name or email
      case "user.updated": {
        const userId: string = data.id
        const email: string = data.email_addresses?.find(
          (e: any) => e.id === data.primary_email_address_id
        )?.email_address
        const firstName: string = data.first_name || ""
        const lastName: string = data.last_name || ""

        await getSupabase()
          .from("organizations")
          .update({
            user_email: email,
            user_full_name: `${firstName} ${lastName}`.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
        break
      }

      default:
        break
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error(`[clerk-webhook] Error handling ${eventType}:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
