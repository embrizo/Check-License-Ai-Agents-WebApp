CREATE TYPE "public"."cert_category" AS ENUM('personal', 'inspection');--> statement-breakpoint
CREATE TABLE "cert_alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"certificate_id" uuid NOT NULL,
	"threshold_days" integer NOT NULL,
	"expire_date" date NOT NULL,
	"recipients" text NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid,
	"category" "cert_category" DEFAULT 'personal' NOT NULL,
	"cert_type" text NOT NULL,
	"holder_name" text,
	"cert_number" text,
	"issue_date" date NOT NULL,
	"expire_date" date NOT NULL,
	"renewal_months" integer NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cert_alert_log" ADD CONSTRAINT "cert_alert_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_alert_log" ADD CONSTRAINT "cert_alert_log_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cert_alert_dedup" ON "cert_alert_log" USING btree ("certificate_id","threshold_days","expire_date");--> statement-breakpoint
CREATE INDEX "ix_cert_alerts_org_sent" ON "cert_alert_log" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "ix_certs_org_expire" ON "certificates" USING btree ("organization_id","expire_date");--> statement-breakpoint
CREATE INDEX "ix_certs_org" ON "certificates" USING btree ("organization_id");