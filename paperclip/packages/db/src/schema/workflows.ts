import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  scope: text("scope").notNull().default("company"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  definition: jsonb("definition").$type<Record<string, unknown>>().notNull().default({}),
  publishedSummary: text("published_summary"),
  createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  companyIdx: index("workflows_company_idx").on(table.companyId),
  companyDefinitionVersionUq: uniqueIndex("workflows_company_definition_version_uq")
    .on(table.companyId, table.name, table.version),
}));
