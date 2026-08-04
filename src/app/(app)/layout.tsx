import { redirect } from "next/navigation";
import { getCurrentUser, SESSION_END_ROUTE } from "@/server/auth/guards";
import { checkAccess } from "@/server/auth/subscription";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Database-backed, so a deactivated user is bounced to /login on their very
  // next navigation instead of riding out the remainder of their JWT.
  const user = await getCurrentUser();
  if (!user) redirect(SESSION_END_ROUTE);

  const access = user.role !== "super_admin" && user.organizationId
    ? await checkAccess(user.organizationId)
    : null;

  return (
    <div className="flex flex-1 flex-col">
      <Nav name={user.name} email={user.email} role={user.role} />
      {access && !access.ok && (
        <div className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {access.reason === "expired"
            ? "Your subscription has expired — the app is read-only. Contact your administrator to renew."
            : access.reason === "suspended"
              ? "Your subscription is suspended. Contact your administrator."
              : "No active subscription on this organization. Contact your administrator."}
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
