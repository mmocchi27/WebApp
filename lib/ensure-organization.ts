import { auth, clerkClient } from "@clerk/nextjs/server"

/**
 * Ensures that a user has an organization. If not, creates a personal organization for them.
 * Returns the organization ID.
 */
export async function ensureUserHasOrganization(): Promise<string | null> {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      console.error("No user ID found")
      return null
    }

    // Get the user's organization memberships
    const client = await clerkClient()
    const orgMemberships = await client.users.getOrganizationMembershipList({ userId })
    
    // If user already has an organization, return the first one
    if (orgMemberships.data && orgMemberships.data.length > 0) {
      return orgMemberships.data[0].organization.id
    }

    // User has no organization, create a personal one
    console.log(`Creating personal organization for user ${userId}`)
    
    const user = await client.users.getUser(userId)
    const orgName = user.firstName 
      ? `${user.firstName}'s Organization` 
      : "My Organization"
    
    const organization = await client.organizations.createOrganization({
      name: orgName,
      createdBy: userId,
    })

    console.log(`Created organization ${organization.id} for user ${userId}`)
    
    return organization.id
  } catch (error) {
    console.error("Error ensuring user has organization:", error)
    return null
  }
}

