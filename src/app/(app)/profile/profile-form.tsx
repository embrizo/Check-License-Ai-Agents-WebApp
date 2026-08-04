"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveProfile, type ProfileState } from "./actions";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function ProfileForm({ name, email, replyToEmail }: { name: string; email: string; replyToEmail: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, undefined);

  useEffect(() => {
    if (state?.success) toast.success("Profile saved.");
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <form action={action}>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={name} maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="replyToEmail">Reply-To for emails you send</Label>
            <Input id="replyToEmail" name="replyToEmail" type="email" defaultValue={replyToEmail} placeholder="you@yourcompany.com" />
            <p className="text-xs text-muted-foreground">
              When you send a renewal draft or manually resend an alert, customer
              replies go here instead of the shared alerts inbox. Leave blank to
              use the default.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
