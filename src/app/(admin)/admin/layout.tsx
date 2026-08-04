import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, SESSION_END_ROUTE } from "@/server/auth/guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Read from the database, not the session token — a super_admin demoted or
  // deactivated mid-session must lose the console immediately, not in 8 hours.
  const user = await getCurrentUser();
  if (!user) redirect(SESSION_END_ROUTE);
  if (user.role !== "super_admin") redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="font-semibold">License Alerts — Admin</span>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
