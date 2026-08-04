import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; passwordUpdated?: string; sessionEnded?: string }>;
}) {
  const { callbackUrl, passwordUpdated, sessionEnded } = await searchParams;

  // Without this the user is dumped back on a blank sign-in form with no idea
  // why — the likeliest reason being that an administrator deactivated them.
  const notice = sessionEnded
    ? "Your session has ended. If this keeps happening, your account may have been deactivated — contact your administrator."
    : passwordUpdated
      ? "Password updated. Please sign in with your new password."
      : null;

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} notice={notice} />
    </div>
  );
}
