CREATE TABLE "atelier_workflow_selections" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"workflow_name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "published_summary" text;--> statement-breakpoint
ALTER TABLE "atelier_workflow_selections" ADD CONSTRAINT "atelier_workflow_selections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;