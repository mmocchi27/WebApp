const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function deleteAllServerDomains() {
  try {
    const serverId = 'f6e418a8-bed8-471d-968e-64f12bce5a08' // Your server UUID from the debug logs
    
    console.log(`Deleting ALL domains for server ${serverId}...\n`)
    
    const result = await prisma.domain.deleteMany({
      where: {
        serverId: serverId
      }
    })
    
    console.log(`✅ Deleted ${result.count} domain record(s)`)
    console.log('\nYou can now add your domains again cleanly.')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

deleteAllServerDomains()

