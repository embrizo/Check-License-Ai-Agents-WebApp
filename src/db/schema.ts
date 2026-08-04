import {
  pgTable, uuid, text, integer, boolean, date, timestamp,
  jsonb, uniqueIndex, index, pgEnum, real,
} from "drizzle-orm/pg-core";

/* ---------- enums ---------- */
export const userRole = pgEnum("user_role", ["super_admin", "org_admin", "member"]);
export const subStatus = pgEnum("subscription_status", ["active", "expired", "suspended", "trial"]);
export const licStatus = pgEnum("license_status", ["ACTIVE", "PERPETUAL", "UNKNOWN"]);
export const parseSource = pgEnum("parse_source", ["flexlm", "ai", "manual"]);
export const reviewState = pgEnum("review_state", ["confirmed", "pending_review"]);

export type UserRole = (typeof userRole.enumValues)[number];

/* ---------- tenancy ---------- */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  replyToEmail: text("reply_to_email"),   // self-service; see docs/03 §3 "Per-user Reply-To"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  emailIdx: uniqueIndex("uq_users_email").on(t.email),   // globally unique — simplest login UX
  orgIdx: index("ix_users_org").on(t.organizationId),
}));

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("standard"),
  status: subStatus("status").notNull().default("trial"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  maxUsers: integer("max_users").notNull().default(5),
  maxLicenses: integer("max_licenses").notNull().default(1000),
  aiCallsPerMonth: integer("ai_calls_per_month").notNull().default(200),
  notes: text("notes"),
  // --- reserved for Phase 8 (Stripe); nullable so it costs nothing today ---
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ orgIdx: index("ix_subs_org").on(t.organizationId) }));

/* ---------- domain (carried over from desktop) ---------- */
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // name is unique per ORG, not globally — the key multi-tenant change
  uq: uniqueIndex("uq_customer_org_name").on(t.organizationId, t.name),
}));

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  notify: boolean("notify").notNull().default(false),
}, (t) => ({ uq: uniqueIndex("uq_contact_customer_email").on(t.customerId, t.email) }));

export const licenseFiles = pgTable("license_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  content: text("content").notNull(),          // raw file text — D5
  contentHash: text("content_hash").notNull(), // sha256, replaces file_hash
  sizeBytes: integer("size_bytes").notNull(),
  parseSource: parseSource("parse_source").notNull().default("flexlm"),
  parseError: text("parse_error"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uq: uniqueIndex("uq_file_customer_name").on(t.customerId, t.filename),
  orgIdx: index("ix_files_org").on(t.organizationId),
}));

export const licenses = pgTable("licenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  licenseFileId: uuid("license_file_id").notNull()
    .references(() => licenseFiles.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  vendor: text("vendor"),
  licenseKey: text("license_key"),      // SN= from the FlexLM line
  soldTo: text("sold_to"),
  version: text("version"),
  issueDate: date("issue_date"),
  expireDate: date("expire_date"),      // plain date — no timezone on a calendar day
  seats: integer("seats"),
  status: licStatus("status").notNull().default("ACTIVE"),
  reviewState: reviewState("review_state").notNull().default("confirmed"),
  confidence: real("confidence"), // AI-parsed rows only (docs/05 §2); null for flexlm/manual
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uq: uniqueIndex("uq_license_file_product").on(t.licenseFileId, t.productName),
  expIdx: index("ix_licenses_org_expire").on(t.organizationId, t.expireDate),
  custIdx: index("ix_licenses_customer").on(t.customerId),
}));

export const alertLog = pgTable("alert_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  licenseId: uuid("license_id").notNull()
    .references(() => licenses.id, { onDelete: "cascade" }),
  thresholdDays: integer("threshold_days").notNull(),
  expireDate: date("expire_date").notNull(),
  recipients: text("recipients").notNull(),
  providerMessageId: text("provider_message_id"),   // Resend id, for delivery tracing
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // THE load-bearing constraint. Never drop this.
  uq: uniqueIndex("uq_alert_dedup").on(t.licenseId, t.thresholdDays, t.expireDate),
  orgIdx: index("ix_alerts_org_sent").on(t.organizationId, t.sentAt),
}));

/* ---------- per-org configuration ---------- */
export const orgSettings = pgTable("org_settings", {
  organizationId: uuid("organization_id").primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  alertThresholds: jsonb("alert_thresholds").$type<number[]>().notNull().default([30, 15]),
  alertRecipients: jsonb("alert_recipients").$type<string[]>().notNull().default([]),
  productFilterRegex: text("product_filter_regex"),  // e.g. "^[nN][xX]\\d+$"; null = all
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  notifyCustomerContacts: boolean("notify_customer_contacts").notNull().default(false),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
});

/* ---------- operational ---------- */
export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  feature: text("feature").notNull(),        // parse | ask | draft
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  succeeded: boolean("succeeded").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ idx: index("ix_ai_org_created").on(t.organizationId, t.createdAt) }));

/**
 * One row per daily-check run. Without this the job's own result was returned
 * as JSON to whoever triggered it and then discarded, so nothing anywhere
 * could answer "did the alerter run today, and did it work?" — the one
 * question this product exists to guarantee a yes to. Cross-org by nature: a
 * run spans every tenant, so there is no organizationId here.
 */
export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: text("job").notNull(),                    // "daily_check"
  trigger: text("trigger").notNull(),            // "cron" | "manual"
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok").notNull().default(false),    // false until it finishes, so a crash reads as failed
  orgsProcessed: integer("orgs_processed").notNull().default(0),
  sent: integer("sent").notNull().default(0),
  skippedDuplicate: integer("skipped_duplicate").notNull().default(0),
  skippedPattern: integer("skipped_pattern").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  errorDetail: text("error_detail"),             // first few failures, for triage
}, (t) => ({
  idx: index("ix_job_runs_job_started").on(t.job, t.startedAt),
}));

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),          // user.create, subscription.extend, file.upload …
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ---------- single-use set-password tokens (docs/04 §2) ---------- */
export const passwordSetupTokens = pgTable("password_setup_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tokenIdx: uniqueIndex("uq_password_setup_token_hash").on(t.tokenHash),
  userIdx: index("ix_password_setup_tokens_user").on(t.userId),
}));
