#!/usr/bin/env node

/**
 * Script to check all IP blacklists via the API endpoint
 * This is designed to be run as a scheduled job (cron) on DigitalOcean App Platform
 */

const https = require('https')
const http = require('http')

const APP_URL = process.env.APP_URL || process.env._APP_URL
const CRON_SECRET = process.env.CRON_SECRET

if (!APP_URL) {
  console.error('Error: APP_URL environment variable is not set')
  process.exit(1)
}

if (!CRON_SECRET) {
  console.error('Error: CRON_SECRET environment variable is not set')
  process.exit(1)
}

const url = new URL(`${APP_URL}/api/admin/check-all-ips`)
const client = url.protocol === 'https:' ? https : http

const options = {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${CRON_SECRET}`,
    'Content-Type': 'application/json',
  },
}

console.log(`[${new Date().toISOString()}] Checking IP blacklists at ${url.toString()}...`)

const req = client.request(url, options, (res) => {
  let data = ''

  res.on('data', (chunk) => {
    data += chunk
  })

  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const result = JSON.parse(data)
        console.log('✅ Blacklist check completed successfully')
        console.log(`   Checked: ${result.results?.checked || 0}`)
        console.log(`   Blacklisted: ${result.results?.blacklisted || 0}`)
        console.log(`   Errors: ${result.results?.errors || 0}`)
        console.log(`   Notifications sent: ${result.results?.notifications || 0}`)
      } catch (e) {
        console.log('Response:', data)
      }
      process.exit(0)
    } else {
      console.error(`❌ Error: HTTP ${res.statusCode}`)
      console.error('Response:', data)
      process.exit(1)
    }
  })
})

req.on('error', (e) => {
  console.error(`❌ Request error: ${e.message}`)
  process.exit(1)
})

req.end()

