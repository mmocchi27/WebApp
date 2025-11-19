const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkEmails() {
  const emails = [
    'hera@theclerk.org',
    'mike@theclerk.org',
    'hera@blueshn.org',
    'mike@blueshn.org',
    'hera@blueshoonsolutions.org',
    'mike@blueshoonsolutions.org'
  ]

  console.log('Checking for existing emails in database...\n')
  
  for (const email of emails) {
    const existing = await prisma.inbox.findUnique({
      where: { email },
      select: { id: true, email: true, status: true, createdAt: true }
    })
    
    if (existing) {
      console.log(`✓ FOUND: ${email}`)
      console.log(`  ID: ${existing.id}`)
      console.log(`  Status: ${existing.status}`)
      console.log(`  Created: ${existing.createdAt}`)
    } else {
      console.log(`✗ NOT FOUND: ${email}`)
    }
    console.log('')
  }
  
  await prisma.$disconnect()
}

checkEmails().catch(console.error)
