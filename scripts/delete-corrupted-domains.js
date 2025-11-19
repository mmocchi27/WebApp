const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function deleteCorruptedDomains() {
  try {
    console.log('Deleting corrupted domain records...\n')
    
    // Delete by domain names we know are corrupted
    const domainNames = ['blue-shoon.org', 'blue-shoons.org', 'tryblueshoon.org']
    
    for (const domainName of domainNames) {
      try {
        const result = await prisma.domain.deleteMany({
          where: {
            domainName: domainName
          }
        })
        
        console.log(`✓ Deleted ${result.count} record(s) for: ${domainName}`)
      } catch (error) {
        console.log(`⚠ Could not delete ${domainName}: ${error.message}`)
      }
    }
    
    console.log('\n✅ Cleanup complete! You can now add these domains again.')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

deleteCorruptedDomains()

