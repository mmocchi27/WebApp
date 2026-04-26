"use client"

import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"

const topLinks = [
  { label: "Domains", href: "/domains" },
]

const bottomLinks = [
  { label: "Billing", href: "/billing" },
  { label: "User Management", href: "/user-management" },
]

export function NavSidebar() {
  const router = useRouter()
  const pathname = usePathname()

  const navBtn = (label: string, href: string) => {
    const active = pathname === href || pathname.startsWith(href + "/")
    return (
      <Button
        key={href}
        onClick={() => router.push(href)}
        disabled={active}
        className={`w-[200px] px-6 py-3 rounded-md font-medium shadow-lg text-left justify-start ${
          active
            ? "bg-blue-800 text-white cursor-default"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {label}
      </Button>
    )
  }

  return (
    <>
      {/* Top nav — main pages */}
      <div className="fixed top-8 left-8 flex flex-col gap-4">
        {topLinks.map(({ label, href }) => navBtn(label, href))}
      </div>

      {/* Bottom nav — account pages */}
      <div className="fixed bottom-8 left-8 flex flex-col gap-4">
        {bottomLinks.map(({ label, href }) => navBtn(label, href))}
      </div>
    </>
  )
}
