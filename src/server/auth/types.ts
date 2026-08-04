import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/db/schema";

export type { UserRole };

// See ./jwt.d.ts for the "next-auth/jwt" augmentation — kept in a separate
// file on purpose (import { UserRole } here from "@/db/schema").
declare module "next-auth" {
  interface User {
    role: UserRole;
    organizationId: string | null;
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      organizationId: string | null;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}
