"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { updateOwnProfile } from "@/server/data/users";

const ProfileInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  replyToEmail: z.union([z.email(), z.literal("")]).optional(),
});

export type ProfileState = { error?: string; success?: boolean } | undefined;

// No orgId parameter, no role check — scoping to session.user.id is what
// makes this safe for every role including `member` (docs/04 §5a).
export async function saveProfile(_prevState: ProfileState, formData: FormData): Promise<ProfileState> {
  const session = await auth();
  if (!session?.user) return { error: "Session expired. Please sign in again." };

  const parsed = ProfileInput.safeParse({
    name: formData.get("name") || undefined,
    replyToEmail: formData.get("replyToEmail") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await updateOwnProfile(session.user.id, {
    name: parsed.data.name,
    replyToEmail: parsed.data.replyToEmail === "" ? null : parsed.data.replyToEmail,
  });

  revalidatePath("/profile");
  return { success: true };
}
