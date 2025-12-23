/**
 * DigitalOcean Function to check all IP blacklists
 * This function calls the API endpoint to check blacklist status
 */

const https = require('https')
const http = require('http')

function main(args) {
  return new Promise((resolve, reject) => {
    const APP_URL = args.APP_URL || process.env.APP_URL
    const CRON_SECRET = args.CRON_SECRET || process.env.CRON_SECRET

    if (!APP_URL) {
      return reject(new Error('APP_URL environment variable is not set'))
    }

    if (!CRON_SECRET) {
      return reject(new Error('CRON_SECRET environment variable is not set'))
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
            
            resolve({
              body: {
                success: true,
                message: 'Blacklist check completed',
                results: result.results
              }
            })
          } catch (e) {
            console.log('Response:', data)
            resolve({
              body: {
                success: true,
                message: 'Check completed (unable to parse response)',
                rawResponse: data
              }
            })
          }
        } else {
          const error = `HTTP ${res.statusCode}: ${data}`
          console.error(`❌ Error: ${error}`)
          reject(new Error(error))
        }
      })
    })

    req.on('error', (e) => {
      const error = `Request error: ${e.message}`
      console.error(`❌ ${error}`)
      reject(new Error(error))
    })

    req.end()
  })
}

module.exports.main = main

