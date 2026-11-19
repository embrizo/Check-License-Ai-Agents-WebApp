"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAction } from "@/lib/run-action";
import {
  createCustomerAction, addContactAction, deleteContactAction, deleteCustomerAction,
  setCustomerDepartmentAction, type CustomerFormState,
} from "./actions";
import { useI18n } from "@/i18n/provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface DeptOption { id: string; name: string }
const NO_DEPT = "none";

/**
 * These forms are client components purely so a rejected save has somewhere to
 * appear. As plain server-action forms, a duplicate name or a malformed email
 * had no way to reach the user — the action returned and the page re-rendered
 * looking unchanged, or threw straight to the error boundary.
 */
export function CreateCustomerForm({ departments = [], canChooseDepartment = false }: {
  departments?: DeptOption[];
  canChooseDepartment?: boolean;
}) {
  const { dict } = useI18n();
  const d = dict.customers;
  const [state, action, pending] = useActionState<CustomerFormState, FormData>(
    createCustomerAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  // Only an org_admin (who sees every department) picks one here; a scoped
  // member's new customer is filed into their own department automatically.
  const showPicker = canChooseDepartment && departments.length > 0;

  return (
    <div className="space-y-2">
      <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
        <Input name="name" placeholder={d.addPlaceholder} required className="max-w-xs" />
        {showPicker && (
          <select name="departmentId" defaultValue="" className="h-9 rounded-md border bg-transparent px-3 text-sm">
            <option value="">— no department —</option>
            {departments.map((dpt) => <option key={dpt.id} value={dpt.id}>{dpt.name}</option>)}
          </select>
        )}
        <Button type="submit" disabled={pending}>{pending ? d.adding : d.addButton}</Button>
      </form>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  );
}

/** Per-row department reassignment on the customers list (org_admin only). */
export function CustomerDepartmentSelect({ customerId, departmentId, departments }: {
  customerId: string;
  departmentId: string | null;
  departments: DeptOption[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={departmentId ?? NO_DEPT}
      disabled={pending}
      className="h-8 rounded-md border bg-transparent px-2 text-sm"
      onChange={(e) => {
        const value = e.target.value === NO_DEPT ? null : e.target.value;
        startTransition(async () => {
          await runAction(() => setCustomerDepartmentAction(customerId, value), "Department updated.");
        });
      }}
    >
      <option value={NO_DEPT}>— none —</option>
      {departments.map((dpt) => <option key={dpt.id} value={dpt.id}>{dpt.name}</option>)}
    </select>
  );
}

export function AddContactForm({ customerId }: { customerId: string }) {
  const boundAction = addContactAction.bind(null, customerId);
  const [state, action, pending] = useActionState<CustomerFormState, FormData>(
    boundAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-2 border-t pt-4">
      <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="contact-email">Email</Label>
          <Input id="contact-email" name="email" type="email" required className="w-56" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="contact-name">Name</Label>
          <Input id="contact-name" name="name" className="w-40" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="notify" />
          Notify on alerts
        </label>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Adding…" : "Add contact"}
        </Button>
      </form>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  );
}

/**
 * Deletes the whole customer — only allowed when it has no licenses/files
 * (the action enforces that and returns a message otherwise). Two-step confirm;
 * on success the customer page is gone, so navigate back to the list.
 */
export function DeleteCustomerButton({ customerId, name }: { customerId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function del() {
    startTransition(async () => {
      const ok = await runAction(() => deleteCustomerAction(customerId), `Deleted "${name}".`);
      if (ok) router.push("/customers");
      else setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        Delete customer
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-muted-foreground">Delete this customer?</span>
      <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={del}>
        {pending ? "Deleting…" : "Yes"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        No
      </Button>
    </span>
  );
}

export function DeleteContactButton({ customerId, contactId, email }: {
  customerId: string;
  contactId: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Remove ${email}`}
      onClick={() => startTransition(async () => {
        await runAction(
          () => deleteContactAction(customerId, contactId),
          `${email} removed.`,
        );
      })}
    >
      Remove
    </Button>
  );
}
