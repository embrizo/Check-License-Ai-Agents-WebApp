"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { logout } from "./actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/db/schema";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/licenses", label: "Licenses" },
  { href: "/customers", label: "Customers" },
  { href: "/uploads", label: "Uploads" },
  { href: "/alerts", label: "Alerts" },
  { href: "/settings", label: "Settings", minRole: "org_admin" as UserRole },
];

export function Nav({ name, email, role }: { name: string | null; email: string; role: UserRole }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const rank: Record<UserRole, number> = { member: 0, org_admin: 1, super_admin: 2 };
  // super_admin always gets orgId: null from requireOrgAccess() (docs/04 §4)
  // — every link below hits an org-scoped page that would throw for them.
  // They operate through /admin only, so that's the only link they see.
  const allLinks = role === "super_admin"
    ? [{ href: "/admin", label: "Admin" }]
    : LINKS.filter((l) => !l.minRole || rank[role] >= rank[l.minRole]);

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <span className="font-semibold">License Alerts</span>

        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main navigation">
          {allLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent",
                pathname.startsWith(link.href) && "bg-accent font-medium",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/profile" className="text-sm text-muted-foreground hover:underline">
            {name ?? email}
          </Link>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">Sign out</Button>
          </form>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      {mobileOpen && (
        <nav className="border-t md:hidden" aria-label="Main navigation">
          <div className="flex flex-col gap-1 px-4 py-3">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                  pathname.startsWith(link.href) && "bg-accent font-medium",
                )}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/profile"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              {name ?? email}
            </Link>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm" className="mt-1 w-full">Sign out</Button>
            </form>
          </div>
        </nav>
      )}
    </header>
  );
}
