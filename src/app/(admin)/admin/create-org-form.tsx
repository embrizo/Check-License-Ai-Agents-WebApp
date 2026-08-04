"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { createOrganizationAction, type CreateOrgState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateOrgForm() {
  const [state, action, pending] = useActionState<CreateOrgState, FormData>(createOrganizationAction, undefined);

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Input name="name" placeholder="New organization name" required className="max-w-xs" />
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create organization"}</Button>
    </form>
  );
}
