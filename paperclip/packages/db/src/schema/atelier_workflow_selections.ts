import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

// FEAT-2026-134: which workflow family (workflows.name) a company currently
// runs. Absent row means the company has not opted in yet and falls back to
// the historical hardcoded default family name.
export const atelierWorkflowSelections = pgTable("atelier_workflow_selections", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  workflowName: text("workflow_name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: text("updated_by_user_id"),
});
