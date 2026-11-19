"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/server/auth/guards";
import { guardErrorMessage } from "@/server/auth/actionError";
import { createCustomer, getCustomer, countCustomerLicenses, deleteCustomerIfNoLicenses, setCustomerDepartment } from "@/server/data/customers";
import { getDepartment } from "@/server/data/departments";
import { createContact, deleteContact } from "@/server/data/contacts";
import { recordAuditLog } from "@/server/data/admin/auditLog";
import { isUniqueViolation } from "@/server/data/errors";
import { isValidEmail } from "@/server/domain/email";
import { resolveWriteDepartment } from "@/server/auth/departmentScope";

export type CustomerFormState = { error?: string; success?: boolean } | undefined;

/**
 * Deletes a customer, but only when it has no licenses — deleting one cascades
 * to its uploaded files, contacts and (through licenses) alert history.
 * Licenses carry that history and aren't trivially re-creatable, so a customer
 * that still has any is refused with a message; files and contacts are allowed
 * to cascade (raw source text is re-uploadable). Audited, since even a
 * license-free delete removes a tenant record.
 */
export async function deleteCustomerAction(customerId: string): Promise<CustomerFormState> {
  let orgId: string;
  let session: Awaited<ReturnType<typeof requireOrg>>["session"];
  let deptScope: Awaited<ReturnType<typeof requireOrg>>["deptScope"];
  try {
    ({ orgId, session, deptScope } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  // getCustomer and the license count key only on (orgId, customerId) and don't
  // depend on each other — fetch together. If the customer turns out not to
  // exist, the count was cheap and harmlessly returned zero.
  const [customer, licenseCount] = await Promise.all([
    getCustomer(orgId, customerId, deptScope),
    countCustomerLicenses(orgId, customerId),
  ]);
  if (!customer) return { error: "That customer doesn't belong to your organization." };

  if (licenseCount > 0) {
    return { error: `Can't delete "${customer.name}" — it still has ${licenseCount} license${licenseCount === 1 ? "" : "s"}. Delete those first.` };
  }

  const deleted = await deleteCustomerIfNoLicenses(orgId, customerId);
  if (!deleted) {
    return { error: "Couldn't delete — it may have just gained a license. Refresh and try again." };
  }

  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "customer.delete",
    targetType: "customer",
    targetId: customerId,
    metadata: { name: customer.name },
  });

  revalidatePath("/customers");
  revalidatePath("/uploads");
  return { success: true };
}

export async function createCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  let orgId: string;
  let deptScope: Awaited<ReturnType<typeof requireOrg>>["deptScope"];
  try {
    ({ orgId, deptScope } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return { error: "Enter a customer name." };

  // A scoped member files the customer into their own department; an org_admin
  // may pick one via the form. Validate any chosen id belongs to this org.
  const requestedDept = (formData.get("departmentId") as string | null)?.trim() || null;
  const departmentId = resolveWriteDepartment(deptScope, requestedDept);
  if (departmentId && !(await getDepartment(orgId, departmentId))) {
    return { error: "That department doesn't belong to your organization." };
  }

  const created = await createCustomer(orgId, name, departmentId);
  if (!created) return { error: `You already have a customer called "${name}".` };

  revalidatePath("/customers");
  revalidatePath("/uploads");
  return { success: true };
}

/**
 * Reassign a customer to a department (or clear it), cascading to its licenses
 * and files (see setCustomerDepartment). org_admin only — a scoped member can't
 * move data between departments. Returns void; runAction surfaces any throw.
 */
export async function setCustomerDepartmentAction(customerId: string, departmentId: string | null) {
  const { orgId, session } = await requireOrg({ role: "org_admin", write: true });

  if (departmentId && !(await getDepartment(orgId, departmentId))) {
    throw new Error("That department doesn't belong to your organization.");
  }

  const updated = await setCustomerDepartment(orgId, customerId, departmentId);
  if (!updated) throw new Error("That customer doesn't belong to your organization.");

  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "customer.department_change",
    targetType: "customer",
    targetId: customerId,
    metadata: { departmentId },
  });
  revalidatePath("/customers");
  revalidatePath("/licenses");
  revalidatePath("/dashboard");
}

export async function addContactAction(
  customerId: string,
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  let orgId: string;
  let deptScope: Awaited<ReturnType<typeof requireOrg>>["deptScope"];
  try {
    ({ orgId, deptScope } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  const email = (formData.get("email") as string | null)?.trim();
  if (!email) return { error: "Enter an email address." };

  // `type="email"` on the input is a client-side hint only, and this address
  // ends up in the recipient list of a real send — one malformed entry makes
  // the provider reject the whole batch (see domain/email.ts).
  if (!isValidEmail(email)) return { error: `"${email}" isn't a valid email address.` };

  const name = (formData.get("name") as string | null)?.trim() || undefined;
  const notify = formData.get("notify") === "on";

  try {
    const contact = await createContact(orgId, customerId, { email, name, notify }, deptScope);
    if (!contact) return { error: "That customer doesn't belong to your organization." };
  } catch (err) {
    if (isUniqueViolation(err, "uq_contact_customer_email")) {
      return { error: `${email} is already a contact for this customer.` };
    }
    throw err;
  }

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function deleteContactAction(customerId: string, contactId: string) {
  try {
    const { orgId, deptScope } = await requireOrg({ write: true });
    await deleteContact(orgId, contactId, deptScope);
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: true as const };
}
