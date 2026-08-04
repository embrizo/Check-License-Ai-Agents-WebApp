import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      {token ? (
        <SetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-destructive">Missing set-password token.</p>
      )}
    </div>
  );
}
