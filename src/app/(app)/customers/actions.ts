"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/server/auth/guards";
import { guardErrorMessage } from "@/server/auth/actionError";
import { createCustomer } from "@/server/data/customers";
import { createContact, deleteContact } from "@/server/data/contacts";
import { isUniqueViolation } from "@/server/data/errors";
import { isValidEmail } from "@/server/domain/email";

export type CustomerFormState = { error?: string; success?: boolean } | undefined;

export async function createCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  let orgId: string;
  try {
    ({ orgId } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return { error: "Enter a customer name." };

  const created = await createCustomer(orgId, name);
  if (!created) return { error: `You already have a customer called "${name}".` };

  revalidatePath("/customers");
  revalidatePath("/uploads");
  return { success: true };
}

export async function addContactAction(
  customerId: string,
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  let orgId: string;
  try {
    ({ orgId } = await requireOrg({ write: true }));
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
    const contact = await createContact(orgId, customerId, { email, name, notify });
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
    const { orgId } = await requireOrg({ write: true });
    await deleteContact(orgId, contactId);
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: true as const };
}
