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

  // 2. Reset leads stuck in "calling" with no matching in-progress call_log.
  //    These accumulate when VAPI never fires a webhook for a call (e.g. call
  //    never connected).  Without this they permanently block the dialer's
  //    active-count check.
  await db.execute(sql`
    UPDATE leads l
    SET status = 'pending'
    WHERE l.status = 'calling'
      AND NOT EXISTS (
        SELECT 1 FROM call_logs cl
        WHERE cl.lead_id = l.id
          AND cl.status = 'initiated'
          AND cl.ended_at IS NULL
      )
  `);

  // Also close any call_log rows that are still 'initiated' but have no
  // matching in-progress VAPI call (ended_at already set by VAPI or stuck).
  await db.execute(sql`
    UPDATE call_logs
    SET status = 'failed',
        outcome = 'Orphaned call — reset at startup',
        ended_at = NOW()
    WHERE status = 'initiated'
      AND ended_at IS NULL
      AND started_at < NOW() - INTERVAL '30 minutes'
  `);

  // 3. Reconcile counters for every campaign from source-of-truth tables.
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
