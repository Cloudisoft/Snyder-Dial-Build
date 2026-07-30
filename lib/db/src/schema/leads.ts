import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  campaignId: serial("campaign_id").references(() => campaignsTable.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  company: text("company"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending, calling, completed, failed, do_not_call
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
