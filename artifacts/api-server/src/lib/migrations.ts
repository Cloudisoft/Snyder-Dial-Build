/**
 * Idempotent startup migrations.
 *
 * Run once on every server boot to:
 *  1. Ensure new schema columns exist (safe on first deploy before `db push`).
 *  2. Reconcile materialized counters against real data for ALL campaigns
 *     so stale or non-zero drifted values are corrected, not just zero rows.
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

export async function runStartupMigrations(): Promise<void> {
  logger.info("Running startup migrations");

  // 1. Add columns if they don't exist yet (handles deploys before `drizzle-kit push`).
  await db.execute(sql`
    ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS total_leads  integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS called_leads integer NOT NULL DEFAULT 0
  `);

  await db.execute(sql`
    ALTER TABLE call_logs
      ADD COLUMN IF NOT EXISTS recording_url text
  `);

  // VAPI sync columns added in the VAPI integration work
  await db.execute(sql`
    ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS vapi_assistant_id text
  `);

  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS vapi_phone_number_id text,
      ADD COLUMN IF NOT EXISTS twilio_api_key      text,
      ADD COLUMN IF NOT EXISTS twilio_api_secret   text
  `);

  await db.execute(sql`
    ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS concurrency integer NOT NULL DEFAULT 1
  `);

  // 2. Reconcile counters for every campaign from source-of-truth tables.
  //    Runs unconditionally so drift (stale non-zero values) is also repaired.
  await db.execute(sql`
    UPDATE campaigns c
    SET
      total_leads = (
        SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id
      ),
      called_leads = (
        SELECT COUNT(*) FROM call_logs cl
        WHERE cl.campaign_id = c.id
          AND cl.status IN ('completed', 'failed', 'no_answer', 'voicemail')
      )
  `);

  logger.info("Startup migrations complete");
}
