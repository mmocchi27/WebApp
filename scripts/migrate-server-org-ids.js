/**
 * Script to migrate servers from user-based organizationId to proper org-based organizationId
 * 
 * This fixes the issue where servers were being shared across all orgs a user belonged to.
 * Run this once to migrate existing data.
 */

const { PrismaClient } = require('@prisma/client')
const { clerkClient } = require('@clerk/clerk-sdk-node')

const prisma = new PrismaClient()

async function migrateServerOrgIds() {
  console.log('🔍 Starting migration of server organizationIds...\n')

  try {
    // Get all servers
    const servers = await prisma.server.findMany()
    
    console.log(`Found ${servers.length} servers to check\n`)

    let migratedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const server of servers) {
      const currentOrgId = server.organizationId
      
      try {
        // Check if the organizationId looks like a Clerk org ID (starts with "org_")
        if (currentOrgId.startsWith('org_')) {
          console.log(`✓ Server ${server.id} already has valid org ID: ${currentOrgId}`)
          skippedCount++
          continue
        }

        // This is likely a user ID - try to find the correct org
        console.log(`⚠️  Server ${server.id} has user-like ID: ${currentOrgId}`)
        
        // Try to find which org this user's server belongs to by checking Stripe
        // This is tricky since we don't know which org the subscription was created under
        console.log(`   ℹ️  Manual review needed for subscription: ${server.subscriptionId}`)
        console.log(`   ℹ️  Current organizationId looks like a user ID: ${currentOrgId}`)
        console.log(`   ℹ️  Please manually check Stripe subscription metadata for the correct clerkOrgId\n`)
        
        errorCount++
        
      } catch (error) {
        console.error(`❌ Error processing server ${server.id}:`, error.message)
        errorCount++
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('Migration Summary:')
    console.log('='.repeat(60))
    console.log(`✓ Already correct: ${skippedCount}`)
    console.log(`⚠️  Need manual review: ${errorCount}`)
    console.log(`✓ Successfully migrated: ${migratedCount}`)
    console.log('='.repeat(60))

    if (errorCount > 0) {
      console.log('\n⚠️  MANUAL ACTION REQUIRED:')
      console.log('Some servers have user IDs instead of org IDs.')
      console.log('For each flagged subscription:')
      console.log('1. Find the subscription in Stripe')
      console.log('2. Check the customer metadata for "clerkOrgId"')
      console.log('3. Update the server record in Supabase with the correct orgId')
      console.log('\nOR: If these servers were created before org implementation,')
      console.log('reassign them to the appropriate org based on who created them.')
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the migration
migrateServerOrgIds()

