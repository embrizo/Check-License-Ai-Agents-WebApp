"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { signIn, signOut, auth } from "@/server/auth";
import { setPassword } from "@/server/data/users";
import { consumeSetupToken } from "@/server/data/passwordSetupTokens";

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const callbackUrl = (formData.get("callbackUrl") as string) || "/dashboard";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password." };
        default:
          return { error: "Something went wrong. Please try again." };
      }
    }
    // NEXT_REDIRECT is thrown by signIn on success — let it propagate.
    throw error;
  }
}

const ChangePasswordInput = z.object({
  password: z.string().min(8, "Must be at least 8 characters."),
  confirmPassword: z.string(),
}).refine((v) => v.password === v.confirmPassword, {
  message: "Passwords don't match.",
  path: ["confirmPassword"],
});

export type ChangePasswordState = { error?: string } | undefined;

export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user) return { error: "Session expired. Please sign in again." };

  const parsed = ChangePasswordInput.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await setPassword(session.user.id, passwordHash);

  // Force a fresh login so the JWT's mustChangePassword claim (set only at
  // sign-in) reflects the DB update — see docs/04 §2.
  await signOut({ redirectTo: "/login?passwordUpdated=1" });
}

const SetPasswordInput = z.object({
  password: z.string().min(8, "Must be at least 8 characters."),
  confirmPassword: z.string(),
  token: z.string().min(1),
}).refine((v) => v.password === v.confirmPassword, {
  message: "Passwords don't match.",
  path: ["confirmPassword"],
});

export type SetPasswordState = { error?: string } | undefined;

/**
 * Unauthenticated by design — this is how a brand-new, admin-created user
 * gets in (docs/04 §2 "Preferred": a single-use set-password link, never a
 * plaintext-emailed password). The token, not a session, is the proof of
 * identity here.
 */
export async function setPasswordViaToken(
  _prevState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const parsed = SetPasswordInput.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const userId = await consumeSetupToken(parsed.data.token);
  if (!userId) {
    return { error: "This link is invalid, expired, or already used. Ask your administrator for a new one." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await setPassword(userId, passwordHash);
  redirect("/login?passwordUpdated=1");
}
