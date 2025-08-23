"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs"
import { useEffect, useState } from "react"

export default function Home() {
  const [isClerkConfigured, setIsClerkConfigured] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    const configured = !!publishableKey
    setIsClerkConfigured(configured)
    setIsLoading(false)
    
    console.log("[v0] Publishable key value:", publishableKey)
    console.log("[v0] Clerk configured:", configured)
  }, [])

  // Show loading state to prevent hydration mismatch
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }



  return (
    <div key="home-page" className="min-h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <svg width="32" height="24" viewBox="0 0 32 24" className="flex-shrink-0">
            {/* Mountains */}
            <path d="M0 24L8 8L16 16L24 4L32 20V24H0Z" fill="#2563eb" opacity="0.8" />
            <path d="M4 24L12 12L20 18L28 8L32 16V24H4Z" fill="#1d4ed8" />
          </svg>
          <span className="font-semibold text-gray-900">MailMountains</span>
        </div>
        <div className="flex items-center gap-4">
          <SignedOut key="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/dashboard">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md">Sign In</Button>
            </SignInButton>
          </SignedOut>
          <SignedIn key="signed-in">
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </header>

      {/* Hero Section */}
      <section className="text-center py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="100%" height="200" viewBox="0 0 800 200" className="w-full h-full" preserveAspectRatio="none">
            {/* Full-width mountains spanning the entire page */}
            <path
              d="M0 200L100 80L200 120L300 60L400 100L500 40L600 80L700 60L800 120V200H0Z"
              fill="#2563eb"
              opacity="0.1"
            />
            <path
              d="M0 200L80 100L180 140L280 80L380 120L480 60L580 100L680 80L800 120V200H0Z"
              fill="#1d4ed8"
              opacity="0.08"
            />
          </svg>
        </div>
        <div className="relative z-10">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Get highly performant inboxes
            <br />
            at industry low prices
          </h1>
          <p className="text-gray-600 text-lg mb-8 max-w-2xl mx-auto">
            Built by a cold emailer, for cold emailers. The perfect balance of cost and performance.
          </p>
          <div className="flex items-center justify-center gap-4 mb-8">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md" asChild>
              <a href="https://calendly.com/mitch-funnelforge/30min" target="_blank" rel="noopener noreferrer">
                Book a Call
              </a>
            </Button>
            <SignedOut key="hero-signed-out">
              <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 px-6 py-3 rounded-md bg-transparent hover:bg-gray-50"
                >
                  Get Started
                </Button>
              </SignUpButton>
            </SignedOut>
            <SignedIn key="hero-signed-in">
              <Button
                variant="outline"
                className="border-gray-300 text-gray-700 px-6 py-3 rounded-md bg-transparent hover:bg-gray-50"
                asChild
              >
                <a href="/dashboard">Go to Dashboard</a>
              </Button>
            </SignedIn>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          <Card className="text-center p-8 border border-gray-200 rounded-lg">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-blue-600 text-xl">⚙️</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Fully Configured for
                <br />
                Maximum
                <br />
                Deliverability
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Every inbox is fully configured for maximum deliverability, with SPF, DKIM, DMARC, and MX records
                properly set up. We handle the entire technical configuration—DNS, authentication protocols, and policy
                enforcement—so no technical expertise is required. Your cold emails are ready to reach the inbox from
                day one.
              </p>
            </CardContent>
          </Card>

          <Card className="text-center p-8 border border-gray-200 rounded-lg">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-green-600 text-xl">⚡</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Fully Compliant</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                We are not breaching Google or Outlook's TOS to provide these inboxes. We are not running on a public
                cloud with risk of being shut down by that provider. All hardware and subnets are owned outright by
                MailMountains. We own 100% of the infrastructure, bringing the risk of being shut down to zero.
              </p>
            </CardContent>
          </Card>

          <Card className="text-center p-8 border border-gray-200 rounded-lg">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-purple-600 text-xl">👥</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">24/7 Support</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Our dedicated support team is available 24/7 to assist with any questions or concerns you may have.
                Beyond answering tickets, we proactively monitor the health of your inboxes in real time. This includes
                tracking key performance signals, deliverability metrics, and reputation indicators across all accounts.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            No lock ins. Flexible payment schedules for all customers.
          </h2>
          <p className="text-gray-600 mb-8">
            Choose the plan that best fits your agency needs. Scale up or down
            <br />
            as your business grows.
          </p>

          <div className="inline-block bg-blue-600 text-white px-4 py-2 rounded-full text-sm mb-8">Most Popular</div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Plan 1 */}
            <Card className="p-8 border border-gray-200 rounded-lg bg-white">
              <CardContent className="text-center">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">1 - 102 Inboxes</h3>
                <p className="text-gray-600 text-sm mb-4">Perfect for managing your own infrastructure.</p>
                <div className="mb-4">
                  <span className="text-sm font-medium text-gray-700">Sending Volume: 100k/month</span>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-blue-600">$200</span>
                  <span className="text-gray-600">/month/server</span>
                  <br />
                  <span className="text-sm text-gray-500">or Less than $2 an inbox</span>
                </div>
                <SignedOut key="pricing-signed-out-1">
                  <SignUpButton mode="modal" forceRedirectUrl="/checkout">
                    <Button
                      variant="outline"
                      className="w-full border-blue-600 text-blue-600 hover:bg-blue-50 bg-transparent"
                    >
                      Get Started
                    </Button>
                  </SignUpButton>
                </SignedOut>
                <SignedIn key="pricing-signed-in-1">
                  <Button
                    variant="outline"
                    className="w-full border-blue-600 text-blue-600 hover:bg-blue-50 bg-transparent"
                    asChild
                  >
                    <a href="/checkout">Get Started</a>
                  </Button>
                </SignedIn>
              </CardContent>
            </Card>

            <Card className="p-8 border-2 border-blue-600 rounded-lg bg-white relative">
              <CardContent className="text-center">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">102+ Inboxes</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Ideal for established agencies or large enterprises that need high volume.
                </p>
                <div className="mb-4">
                  <span className="text-sm font-medium text-gray-700">Sending Volume: Custom</span>
                </div>
                <div className="mb-6">
                  <span className="text-2xl font-bold text-blue-600">Contact us for custom pricing</span>
                </div>
                <SignedOut key="pricing-signed-out-2">
                  <SignUpButton mode="modal" forceRedirectUrl="/checkout">
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">Get Started</Button>
                  </SignUpButton>
                </SignedOut>
                <SignedIn key="pricing-signed-in-2">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" asChild>
                    <a href="/checkout">Get Started</a>
                  </Button>
                </SignedIn>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">Frequently Asked Questions</h2>
          <p className="text-gray-600 text-center mb-12">
            Find answers to common questions about MailMountains and our services.
          </p>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="border border-gray-200 rounded-lg px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                What is MailMountains?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                MailMountains is an infrastructure provider for cold emailers. We provide the dedicated servers and IP
                addresses needed to send quality cold email at scale. We are designed for companies who want to send
                ethical cold email.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="border border-gray-200 rounded-lg px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                Why do you not sell Google Workspaces or Outlook?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Resellers of Google Workspaces or Outlook are actually breaching the terms of service of those ESPs. We
                have built our own infrastructure to stay fully compliant, while having 100% control over
                deliverability.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="border border-gray-200 rounded-lg px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                How long does it take to get the accounts?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                We require to hop on a call with all of our customers to ensure the platform won't be abused. After all,
                you are running on brand new servers and IPs. Once accepted, it's only a few hours before you are up and
                running.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="border border-gray-200 rounded-lg px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                How do you know this is industry best practice?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Our founder has sent more than 10 million emails in the past 12 months. He has extensive empirical data
                to prove what works best, and more importantly, what is legal.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 bg-blue-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Get Started?</h2>
          <p className="text-blue-100 text-lg mb-8">
            Join thousands of businesses who trust MailMountains for their email
            <br />
            needs.
          </p>
          <Button className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-3 rounded-md font-semibold" asChild>
            <a href="https://calendly.com/mitch-funnelforge/30min" target="_blank" rel="noopener noreferrer">
              Book Time with Us
            </a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-8 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <svg width="32" height="24" viewBox="0 0 32 24" className="flex-shrink-0">
              {/* Mountains only - no mail icon */}
              <path d="M0 24L8 8L16 16L24 4L32 20V24H0Z" fill="#2563eb" opacity="0.8" />
              <path d="M4 24L12 12L20 18L28 8L32 16V24H4Z" fill="#1d4ed8" />
            </svg>
            <span className="font-semibold text-white">MailMountains</span>
          </div>
          <p className="text-gray-400 text-sm">Professional email solutions for modern businesses.</p>
          <p className="text-gray-500 text-xs mt-4">FunnelForge LLC</p>
        </div>
      </footer>
    </div>
  )
}
