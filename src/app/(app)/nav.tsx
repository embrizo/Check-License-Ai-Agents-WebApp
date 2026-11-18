"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { logout } from "./actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";
import { LanguageToggle } from "@/i18n/language-toggle";
import type { Dict } from "@/i18n/dictionaries";
import type { UserRole } from "@/db/schema";

type NavKey = keyof Dict["nav"];

const LINKS: { href: string; key: NavKey; minRole?: UserRole }[] = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/licenses", key: "licenses" },
  { href: "/customers", key: "customers" },
  { href: "/certificates", key: "certificates" },
  { href: "/uploads", key: "uploads" },
  { href: "/alerts", key: "alerts" },
  { href: "/settings", key: "settings", minRole: "org_admin" as UserRole },
];

export function Nav({ name, email, role }: { name: string | null; email: string; role: UserRole }) {
  const pathname = usePathname();
  const { dict } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const rank: Record<UserRole, number> = { member: 0, org_admin: 1, super_admin: 2 };
  // super_admin always gets orgId: null from requireOrgAccess() (docs/04 §4)
  // — every link below hits an org-scoped page that would throw for them.
  // They operate through /admin only, so that's the only link they see.
  const allLinks = role === "super_admin"
    ? [{ href: "/admin", label: dict.nav.admin }]
    : LINKS.filter((l) => !l.minRole || rank[role] >= rank[l.minRole]).map((l) => ({ href: l.href, label: dict.nav[l.key] }));

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <span className="font-semibold">{dict.nav.brand}</span>

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
          <LanguageToggle />
          <Link href="/profile" className="text-sm text-muted-foreground hover:underline">
            {name ?? email}
          </Link>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">{dict.nav.signOut}</Button>
          </form>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto md:hidden"
          aria-label={mobileOpen ? dict.nav.closeMenu : dict.nav.openMenu}
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
            <div className="px-3 py-2"><LanguageToggle /></div>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm" className="mt-1 w-full">{dict.nav.signOut}</Button>
            </form>
          </div>
        </nav>
      )}
    </header>
  );
}
