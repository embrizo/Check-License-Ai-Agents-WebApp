CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"alert_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "license_files" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_department_org_name" ON "departments" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "ix_departments_org" ON "departments" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_files" ADD CONSTRAINT "license_files_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_certs_dept" ON "certificates" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "ix_customers_dept" ON "customers" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "ix_licenses_dept" ON "licenses" USING btree ("department_id");