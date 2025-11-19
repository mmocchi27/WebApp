const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function checkForNullBytes() {
  try {
    console.log('Checking for null bytes in domains table...\n')
    
    const domains = await prisma.$queryRaw`
      SELECT 
        domain_name,
        cloudflare_zone_id,
        cloudflare_status,
        master_domain,
        length(domain_name) as name_len,
        position(E'\\000' in domain_name) as null_in_domain,
        position(E'\\000' in COALESCE(cloudflare_zone_id, '')) as null_in_zone,
        position(E'\\000' in cloudflare_status) as null_in_status,
        position(E'\\000' in COALESCE(master_domain, '')) as null_in_master
      FROM domains 
      WHERE domain_name IN ('blue-shoon.org', 'blue-shoons.org', 'tryblueshoon.org')
    `
    
    console.log('Results:')
    console.log(JSON.stringify(domains, null, 2))
    
    const hasNulls = domains.some(d => 
      d.null_in_domain > 0 || 
      d.null_in_zone > 0 || 
      d.null_in_status > 0 ||
      d.null_in_master > 0
    )
    
    if (hasNulls) {
      console.log('\n❌ Found null bytes in one or more domains!')
      console.log('Recommendation: Delete and re-add these domains')
    } else {
      console.log('\n✅ No null bytes found in these domains')
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkForNullBytes()

