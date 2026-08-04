import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { getUserById } from "@/server/data/users";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await getUserById(session.user.id);
  if (!user) redirect("/login");

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Your profile</h1>
        <p className="text-sm text-muted-foreground">
          Personal settings only — thresholds and alert recipients live in{" "}
          org-wide Settings.
        </p>
      </div>
      <ProfileForm name={user.name ?? ""} email={user.email} replyToEmail={user.replyToEmail ?? ""} />
    </div>
  );
}
