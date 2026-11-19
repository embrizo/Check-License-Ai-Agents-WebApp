"use client";

import { useActionState, useState, useTransition } from "react";
import { runAction } from "@/lib/run-action";
import {
  createDepartmentAction, setDepartmentRecipientsAction, type CreateDepartmentState,
} from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Dept { id: string; name: string; alertRecipients: string[] }

export function DepartmentManagement({ orgId, departments }: { orgId: string; departments: Dept[] }) {
  const boundCreate = createDepartmentAction.bind(null, orgId);
  const [state, action, pending] = useActionState<CreateDepartmentState, FormData>(boundCreate, undefined);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Departments ({departments.length})</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Split this organization into departments (e.g. NX, PTC). A member assigned
          to a department sees only its customers, licenses and certificates;
          org_admins see every department. Each department&apos;s expiry alerts go only
          to its own recipients below.
        </p>

        {departments.length > 0 ? (
          <div className="space-y-3">
            {departments.map((dpt) => (
              <DepartmentRow key={dpt.id} orgId={orgId} dept={dpt} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No departments yet.</p>
        )}

        <form action={action} className="flex flex-wrap items-end gap-2 border-t pt-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="dept-name">New department</Label>
            <Input id="dept-name" name="name" placeholder="e.g. NX" required className="w-56" />
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add department"}</Button>
        </form>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      </CardContent>
    </Card>
  );
}

function DepartmentRow({ orgId, dept }: { orgId: string; dept: Dept }) {
  const [value, setValue] = useState(dept.alertRecipients.join(", "));
  const [pending, startTransition] = useTransition();

  const dirty = value.trim() !== dept.alertRecipients.join(", ").trim();

  function save() {
    startTransition(async () => {
      await runAction(
        () => setDepartmentRecipientsAction(orgId, dept.id, value),
        `Recipients for ${dept.name} saved.`,
      );
    });
  }

  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">{dept.name}</span>
        <span className="text-xs text-muted-foreground">{dept.alertRecipients.length} recipient(s)</span>
      </div>
      <Label htmlFor={`recips-${dept.id}`} className="text-xs text-muted-foreground">
        Alert recipients (comma or newline separated)
      </Label>
      <div className="mt-1 flex items-start gap-2">
        <textarea
          id={`recips-${dept.id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={2}
          placeholder="ops.nx@example.com, lead.nx@example.com"
          className="min-h-9 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
        />
        <Button type="button" size="sm" disabled={pending || !dirty} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
