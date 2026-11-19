"use client";

import { useActionState } from "react";
import { createDepartmentAction, type CreateDepartmentState } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface DeptOption { id: string; name: string }

export function DepartmentManagement({ orgId, departments }: { orgId: string; departments: DeptOption[] }) {
  const boundCreate = createDepartmentAction.bind(null, orgId);
  const [state, action, pending] = useActionState<CreateDepartmentState, FormData>(boundCreate, undefined);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Departments ({departments.length})</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Split this organization into departments (e.g. NX, PTC). A member assigned
          to a department sees only its customers, licenses and certificates;
          org_admins see every department.
        </p>

        {departments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {departments.map((dpt) => (
              <span key={dpt.id} className="rounded-md border px-3 py-1 text-sm">{dpt.name}</span>
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
