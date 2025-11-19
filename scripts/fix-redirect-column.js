const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function fixRedirectColumn() {
  try {
    console.log('Fixing redirect_configured column type...\n')
    
    // Drop the wrong column
    await prisma.$executeRaw`ALTER TABLE domains DROP COLUMN IF EXISTS redirect_configured`
    console.log('✓ Dropped incorrect text column')
    
    // Add it back as boolean
    await prisma.$executeRaw`ALTER TABLE domains ADD COLUMN redirect_configured boolean NOT NULL DEFAULT false`
    console.log('✓ Added correct boolean column')
    
    console.log('\n✅ Column fixed! Try adding domains again.')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixRedirectColumn()

