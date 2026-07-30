import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const knowledgeBaseFilesTable = pgTable("knowledge_base_files", {
  id: serial("id").primaryKey(),
  campaignId: serial("campaign_id").references(() => campaignsTable.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  filePath: text("file_path").notNull(),
  content: text("content"),
  status: text("status").notNull().default("processing"), // processing, ready, error
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertKnowledgeBaseFileSchema = createInsertSchema(knowledgeBaseFilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKnowledgeBaseFile = z.infer<typeof insertKnowledgeBaseFileSchema>;
export type KnowledgeBaseFile = typeof knowledgeBaseFilesTable.$inferSelect;
