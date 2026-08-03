/**
 * Shared call-dialing utilities.
 *
 * All concurrency-aware dialing logic lives here so launch, webhook, and
 * upload handlers stay in sync with the same slot-counting rules.
 *
 * "Active" means a lead whose status is "calling" — set when we initiate the
 * VAPI call and cleared by the webhook when the call ends.
 */

import { and, eq, sql } from "drizzle-orm";
import {
  db,
  campaignsTable,
  callLogsTable,
  leadsTable,
  usersTable,
} from "@workspace/db";
import { initiateVapiCall, interpolatePrompt } from "./vapi";
import { logger } from "./logger";

type Campaign = typeof campaignsTable.$inferSelect;
type User = typeof usersTable.$inferSelect;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Count leads currently mid-call (status = 'calling') for this campaign. */
export async function getActiveCallCount(campaignId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.campaignId, campaignId),
        eq(leadsTable.status, "calling"),
      ),
    );
  return row?.n ?? 0;
}

/** Build the webhook URL from environment variables. */
export function resolveWebhookUrl(): string {
  const replitDomains = process.env.REPLIT_DOMAINS;
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  const host = replitDomains
    ? `https://${replitDomains.split(",")[0].trim()}`
    : devDomain
      ? `https://${devDomain}`
      : (process.env.API_BASE_URL ?? "");
  return `${host}/api/webhooks/vapi`;
}

/** Resolve effective VAPI/Twilio credentials (campaign-level overrides user-level). */
export function resolveCredentials(campaign: Campaign, user: User | undefined) {
  return {
    vapiKey: campaign.vapiApiKey || user?.vapiApiKey || null,
    twilioSid: campaign.twilioAccountSid || user?.twilioAccountSid || null,
    twilioToken: campaign.twilioAuthToken || user?.twilioAuthToken || null,
    twilioPhone: campaign.twilioPhoneNumber || user?.twilioPhoneNumber || null,
    assistantId: campaign.vapiAssistantId ?? undefined,
    phoneNumberId: user?.vapiPhoneNumberId ?? undefined,
  };
}

// ── Core dialer ───────────────────────────────────────────────────────────────

/**
 * Dial ONE next pending lead for the campaign.
 *
 * Uses a two-step optimistic claim:
 *   1. Find the lowest-id pending lead.
 *   2. Atomically flip it to 'calling' only if it is still 'pending'.
 * Returns true if a call was successfully initiated.
 */
export async function dialNextPendingLead(
  campaign: Campaign,
  user: User | undefined,
  webhookUrl: string,
): Promise<boolean> {
  const creds = resolveCredentials(campaign, user);
  if (!creds.vapiKey) return false;

  // Step 1 — find next pending lead
  const [next] = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.campaignId, campaign.id),
        eq(leadsTable.status, "pending"),
      ),
    )
    .orderBy(leadsTable.id)
    .limit(1);

  if (!next) return false; // no more pending leads

  // Step 2 — atomically claim it (guards against races with concurrent webhook callbacks)
  const [lead] = await db
    .update(leadsTable)
    .set({ status: "calling" })
    .where(
      and(
        eq(leadsTable.id, next.id),
        eq(leadsTable.status, "pending"), // only claim if still pending
      ),
    )
    .returning();

  if (!lead) return false; // another callback claimed it first — caller should retry

  try {
    const nameParts = (lead.name ?? "").trim().split(/\s+/);
    const systemPrompt = interpolatePrompt(campaign.masterPrompt, {
      name: lead.name,
      first_name: nameParts[0] ?? "",
      last_name: nameParts.slice(1).join(" ") || "",
      company: lead.company,
      phone: lead.phone,
      email: lead.email,
      notes: lead.notes,
    });

    const { callId } = await initiateVapiCall({
      vapiApiKey: creds.vapiKey,
      toNumber: lead.phone,
      customerName: lead.name,
      systemPrompt,
      webhookUrl,
      assistantId: creds.assistantId,
      phoneNumberId: creds.phoneNumberId,
      twilioAccountSid: creds.twilioSid ?? undefined,
      twilioAuthToken: creds.twilioToken ?? undefined,
      twilioPhoneNumber: creds.twilioPhone ?? undefined,
    });

    await db.insert(callLogsTable).values({
      campaignId: campaign.id,
      leadId: lead.id,
      vapiCallId: callId,
      status: "initiated",
      startedAt: new Date(),
    });

    logger.info(
      { campaignId: campaign.id, leadId: lead.id, vapiCallId: callId },
      "VAPI call initiated",
    );
    return true;
  } catch (err) {
    logger.error(
      { campaignId: campaign.id, leadId: lead.id, err },
      "Failed to initiate VAPI call — reverting lead to pending",
    );
    await db
      .update(leadsTable)
      .set({ status: "pending" })
      .where(eq(leadsTable.id, lead.id));
    return false;
  }
}

/**
 * Fill all available concurrency slots for an active campaign.
 *
 * Safe to call from launch, webhook end-of-call, and upload — idempotent
 * if the campaign is already at capacity or has no pending leads.
 */
export async function fillConcurrencySlots(campaignId: number): Promise<void> {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  if (!campaign || campaign.status !== "active") return;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, campaign.userId));

  const creds = resolveCredentials(campaign, user);
  if (!creds.vapiKey) {
    logger.warn({ campaignId }, "fillConcurrencySlots: no VAPI key — skipping");
    return;
  }

  const concurrency = Math.max(1, campaign.concurrency ?? 1);
  const active = await getActiveCallCount(campaignId);
  const slots = concurrency - active;

  if (slots <= 0) return; // already at capacity

  const webhookUrl = resolveWebhookUrl();

  for (let i = 0; i < slots; i++) {
    const dialed = await dialNextPendingLead(campaign, user, webhookUrl);
    if (!dialed) break; // no more pending leads
  }
}
