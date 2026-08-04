"use client";

import { useActionState, useTransition } from "react";
import { runAction } from "@/lib/run-action";
import {
  createUserAction, toggleUserActiveAction, changeUserRoleAction, type CreateUserState,
} from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Role = "member" | "org_admin" | "super_admin";
interface UserRow { id: string; email: string; name: string | null; role: Role; isActive: boolean }

export function UserManagement({ orgId, users }: { orgId: string; users: UserRow[] }) {
  const boundCreate = createUserAction.bind(null, orgId);
  const [state, action, pending] = useActionState<CreateUserState, FormData>(boundCreate, undefined);
  const [pendingRow, startRowTransition] = useTransition();

  const setupLink = state?.setupToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/set-password?token=${state.setupToken}`
    : null;

  function toggleActive(userId: string, isActive: boolean) {
    startRowTransition(async () => {
      await runAction(
        () => toggleUserActiveAction(orgId, userId, isActive),
        isActive ? "User reactivated." : "User deactivated. Their session ends immediately.",
      );
    });
  }

  function changeRole(userId: string, role: Role) {
    startRowTransition(async () => {
      await runAction(() => changeUserRoleAction(orgId, userId, role), "Role updated.");
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Users ({users.length})</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{u.name ?? "—"}</TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={(v) => v && changeRole(u.id, v as Role)}>
                      <SelectTrigger className="w-36" disabled={pendingRow}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">member</SelectItem>
                        <SelectItem value="org_admin">org_admin</SelectItem>
                        <SelectItem value="super_admin">super_admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? "default" : "secondary"}>{u.isActive ? "active" : "deactivated"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="sm" disabled={pendingRow} onClick={() => toggleActive(u.id, !u.isActive)}>
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No users yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <form action={action} className="flex flex-wrap items-end gap-2 border-t pt-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required className="w-56" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="role">Role</Label>
            <select id="role" name="role" defaultValue="member" className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="member">member</option>
              <option value="org_admin">org_admin</option>
              <option value="super_admin">super_admin</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create user"}</Button>
        </form>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

        {setupLink && (
          <div className="rounded-md border bg-muted/50 p-3 text-sm">
            <p className="mb-1 font-medium">Account created. Share this one-time set-password link (expires in 24h):</p>
            <code className="break-all">{setupLink}</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
