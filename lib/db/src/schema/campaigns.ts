import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: serial("user_id").references(() => usersTable.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"), // draft, active, paused, completed
  objective: text("objective").notNull().default(""),
  masterPrompt: text("master_prompt").notNull().default(""),
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioPhoneNumber: text("twilio_phone_number"),
  vapiApiKey: text("vapi_api_key"),
  totalLeads: integer("total_leads").notNull().default(0),
  calledLeads: integer("called_leads").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
