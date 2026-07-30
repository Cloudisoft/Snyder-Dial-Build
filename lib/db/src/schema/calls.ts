import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";
import { leadsTable } from "./leads";

export const callLogsTable = pgTable("call_logs", {
  id: serial("id").primaryKey(),
  campaignId: serial("campaign_id").references(() => campaignsTable.id),
  leadId: serial("lead_id").references(() => leadsTable.id),
  vapiCallId: text("vapi_call_id"), // VAPI call ID for webhook matching
  status: text("status").notNull().default("initiated"), // initiated, in_progress, completed, failed, no_answer, voicemail
  duration: integer("duration"), // seconds
  transcript: text("transcript"),
  recordingUrl: text("recording_url"),
  outcome: text("outcome"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCallLogSchema = createInsertSchema(callLogsTable).omit({ id: true, createdAt: true });
export type InsertCallLog = z.infer<typeof insertCallLogSchema>;
export type CallLog = typeof callLogsTable.$inferSelect;
